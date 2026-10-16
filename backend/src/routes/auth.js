const express = require('express');
const { query, executeScalar, executeNonQuery } = require('../config/db');
const { generateToken, generateOTP, authMiddleware } = require('../services/auth');
const { sendOTPEmail } = require('../services/mailer');
const { lookupMember } = require('../services/member');
const { ensureRespondentUserByEmail } = require('../services/respondent');

const router = express.Router();

/**
 * POST /api/auth/member-lookup
 * Body: { membershipNo, dob } (dob as yyyy-MM-dd)
 * Validates an ICAI member via the ICAI e-services and returns their profile
 * (name, email, mobile, registrationDate, registrationNumber, city, membershipType).
 */
router.post('/member-lookup', async (req, res) => {
  try {
    const membershipNo = String(req.body.membershipNo || '').trim();
    const dob = String(req.body.dob || '').trim();
    if (!membershipNo) return res.status(400).json({ error: 'Membership No is required' });

    const dobYMD = dob ? `${dob.slice(0, 4)}/${dob.slice(5, 7)}/${dob.slice(8, 10)}` : '';
    const member = await lookupMember(membershipNo, dobYMD);
    res.json(member);
  } catch (e) {
    console.error('member lookup error:', e);
    if (e.notFound) return res.status(404).json({ error: 'Please enter valid Membership No. or Date of Birth' });
    res.status(502).json({ error: 'Unable to connect to the ICAI member service. Please try again later.' });
  }
});

/**
 * POST /api/auth/request-otp
 * Body: { email }
 * Sends OTP to the email if the user exists.
 */
router.post('/request-otp', async (req, res) => {
  try {
    const email = (req.body.email || '').trim();
    if (!email) return res.status(400).json({ error: 'Email is required' });

    let user = (await query('SELECT UserID, Email, NameOfTheUser, IsDeactivated FROM tbl_Users WHERE Email=@email', { email }))[0];

    // No existing account? If the email belongs to a respondent on a complaint
    // (tbl_NewComplaint.ResEmailID), create (or repair) their UserType-2 account
    // so they can log in and respond to the written-statement / Rule-12 query.
    let created = false;
    if (!user) {
      const resp = await ensureRespondentUserByEmail(email);
      if (resp && resp.user) {
        user = resp.user;
        created = !!resp.created;
        if (resp.repaired) {
          // Re-fetch so the login uses the repaired email address
          user = (await query('SELECT UserID, Email, NameOfTheUser, IsDeactivated FROM tbl_Users WHERE UserID=@id', { id: resp.user.UserID }))[0];
        }
      }
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found...' });
    }
    if (Number(user.IsDeactivated) === 1) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    const otp = generateOTP();
    // ASPX stores OTP in tbl_Users and sends it via email; no expiry column is used
    await executeNonQuery('UPDATE tbl_Users SET OTP=@otp WHERE UserID=@id', {
      otp,
      id: user.UserID,
    });

    let emailSent = true;
    try {
      await sendOTPEmail(email, otp);
    } catch (e) {
      emailSent = false;
      // If email fails (e.g. missing SMTP credentials), still store OTP; client can fall back
      console.warn('OTP email failed, but OTP stored', e.message);
    }

    res.json({
      message: created
        ? 'Respondent login created. OTP has been sent to your email id'
        : emailSent
          ? 'OTP has been sent to your email id'
          : 'OTP stored, but email delivery failed.',
      emailSent,
      created,
      // Expose OTP to the client in development so login/testing works without a working SMTP
      otp: process.env.NODE_ENV !== 'production' ? otp : undefined,
    });
  } catch (e) {
    console.error('request-otp error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/auth/verify-otp
 * Body: { email, otp }
 * Validates OTP and issues JWT.
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const email = (req.body.email || '').trim();
    const otp = String(req.body.otp || '').trim();
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

    const rows = await query(
      'SELECT UserID, LoginID, NameOfTheUser, Email, MembershipNo, UserType, OTP, IsDeactivated, IsVerify FROM tbl_Users WHERE Email=@email',
      { email }
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = rows[0];
    if (Number(user.IsDeactivated) === 1) return res.status(403).json({ error: 'Account is deactivated' });
    if (String(user.OTP) !== otp) {
      return res.status(401).json({ error: 'Invalid OTP' });
    }

    // Clear OTP after successful verification
    await executeNonQuery('UPDATE tbl_Users SET OTP=NULL WHERE UserID=@id', { id: user.UserID });

    const token = generateToken(user);
    res.cookie('icai_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 1000 });
    res.json({ token, user: { ...user, OTP: undefined } });
  } catch (e) {
    console.error('verify-otp error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/auth/register
 * Body: { name, email, mobile, membershipNo?, isICAIMember, isGovEmp, registrationNumber? }
 * Creates a non-member / member account.
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email: rawEmail, mobile, membershipNo, isICAIMember, isGovEmp, registrationNumber, dob, governmentFields } = req.body;
    const email = (rawEmail || '').trim();
    if (!name || !email || !mobile) return res.status(400).json({ error: 'Name, email, mobile required' });

    // Mirrors the ASPX CheckDoubleEntry flow:
    //   type 1 : verified user already exists with same Email          -> block "already registered"
    //   type 12/3 : unverified user already registered (LoginID=email)  -> do not re-insert, just resend OTP
    const verified = await executeScalar(
      'SELECT COUNT(*) FROM tbl_Users WHERE LTRIM(RTRIM(Email))=@email AND IsVerify=1',
      { email }
    );
    if (Number(verified) > 0) return res.status(409).json({ error: 'Email already registered' });

    const existing = await query(
      "SELECT UserID, Email FROM tbl_Users WHERE LTRIM(RTRIM(Email))=@email OR LoginID=@email",
      { email }
    );

    const otp = generateOTP();
    let inserted = false;

    if (existing.length === 0) {
      // UserType: 002 = ICAI member, 003 = non-member
      const userType = isICAIMember ? 2 : 3;
      // ASPX stores '1900-01-01' for government employees (DOB field hidden)
      const dobValue = isGovEmp ? '1900-01-01' : (dob || null);

      await executeNonQuery(
        `INSERT INTO tbl_Users
          (LoginID, NameOfTheUser, Email, Mob, MembershipNo, RegistrationNumber, DOB, IsICAIMember, IsGovEmp, UserType, IsVerify, IsDeactivated, OTP, RegisterDate,
           City, MembershipType, NameOfOffice, RegulatorDesignation, GovernmentID, Address, Area, Landmark, StateID, CityID, Pincode, CountryCode, STDCode, LandlineNo, Region, CompType, RegulatorID, RegulatorName)
         VALUES
          (@email, @name, @email, @mobile, @membershipNo, @registrationNumber, @dob, @isICAIMember, @isGovEmp, @userType, 0, 0, @otp, @registerDate,
           @city, @membershipType, @office, @designation, @govId, @address, @area, @landmark, @stateId, @cityId, @pincode, @countryCode, @stdCode, @landlineNo, @region, @compType, @regulatorId, @regulatorName)`,
        {
          email,
          name,
          mobile,
          membershipNo: membershipNo || null,
          registrationNumber: registrationNumber || null,
          dob: dobValue,
          isICAIMember: isICAIMember ? 1 : 0,
          isGovEmp: isGovEmp ? 1 : 0,
          userType: userType === 2 ? 2 : 3,
          otp,
          // ASPX stores the member's CA registration date; for others, the account creation date
          registerDate: governmentFields?.registerDate || (isICAIMember ? (req.body.memberRegistrationDate || null) : new Date()),
          city: governmentFields?.city || req.body.memberCity || null,
          membershipType: governmentFields?.membershipType || req.body.memberMembershipType || null,
          office: governmentFields?.office || null,
          designation: governmentFields?.designation || null,
          govId: governmentFields?.govId || null,
          address: governmentFields?.address || null,
          area: governmentFields?.area || null,
          landmark: governmentFields?.landmark || null,
          stateId: governmentFields?.stateId || null,
          cityId: governmentFields?.cityId || null,
          pincode: governmentFields?.pincode || null,
          countryCode: governmentFields?.countryCode || null,
          stdCode: governmentFields?.stdCode || null,
          landlineNo: governmentFields?.landlineNo || null,
          region: governmentFields?.region || null,
          compType: governmentFields?.compType || null,
          regulatorId: governmentFields?.regulatorId || null,
          regulatorName: governmentFields?.regulatorName || null,
        }
      );
      inserted = true;
    } else {
      // Unverified re-registration: ASPX skips the INSERT and just resends OTP to that email
      await executeNonQuery('UPDATE tbl_Users SET OTP=@otp WHERE UserID=@id', {
        otp,
        id: existing[0].UserID,
      });
    }

    let emailSent = true;
    try {
      await sendOTPEmail(email, otp);
    } catch (e) {
      emailSent = false;
      console.warn('Registration OTP email failed, but OTP stored', e.message);
    }

    res.json({
      message: emailSent
        ? 'OTP has been sent on given email...'
        : 'OTP stored, but email delivery failed.',
      emailSent,
      inserted,
      otp: process.env.NODE_ENV !== 'production' ? otp : undefined,
    });
  } catch (e) {
    console.error('register error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/auth/verify-registration
 * Body: { email, otp }
 * Completes registration (sets IsVerify=1) and returns token.
 */
router.post('/verify-registration', async (req, res) => {
  try {
    const email = (req.body.email || '').trim();
    const otp = String(req.body.otp || '').trim();
    const rows = await query('SELECT * FROM tbl_Users WHERE Email=@email', { email });
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = rows[0];
    if (String(user.OTP) !== otp) return res.status(401).json({ error: 'Invalid OTP' });

    await executeNonQuery('UPDATE tbl_Users SET IsVerify=1, OTP=NULL WHERE UserID=@id', { id: user.UserID });
    const token = generateToken(user);
    res.cookie('icai_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 1000 });
    res.json({ token, user: { ...user, OTP: undefined } });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

/** POST /api/auth/logout - clears the session cookie. */
router.post('/logout', (req, res) => {
  res.clearCookie('icai_token', { httpOnly: true, sameSite: 'lax' });
  res.json({ message: 'Logged out' });
});

/** GET /api/auth/me - returns current user loaded fresh from DB (complete incl. role designation). */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM tbl_Users WHERE UserID=@id', { id: req.user.UserID });
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = rows[0];
    res.json({ user: { ...user, OTP: undefined } });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
