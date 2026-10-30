const { query, executeNonQuery } = require('../config/db');

/**
 * Locate the most recent complaint whose respondent email matches, so a
 * respondent can be granted a login without first registering.
 */
async function lookupRespondentByEmail(email) {
  const rows = await query(
    `SELECT TOP 1 CompID, ResName, ResRegistrationNo, ResMobileNo, ResEmailID, RCityName
     FROM tbl_NewComplaint
     WHERE LOWER(LTRIM(RTRIM(ResEmailID)))=@email AND (IsTemp IS NULL OR IsTemp = 0)
     ORDER BY CompID DESC`,
    { email: String(email).trim().toLowerCase() }
  );
  return rows[0] || null;
}

/**
 * Locate the most recent answerable member whose email matches. In a firm
 * complaint the answerable members act as the respondents, so they need their
 * own UserType-2 login to file the written statement / Rule-12 reply.
 */
async function lookupAnswerableByEmail(email) {
  const rows = await query(
    `SELECT TOP 1 AMemID, CompID, MemName, MemRegistrationNo, MemMobileNo, MemEmailID, MemCityName
     FROM tbl_AnswerableMember
     WHERE LOWER(LTRIM(RTRIM(MemEmailID)))=@email
     ORDER BY AMemID DESC`,
    { email: String(email).trim().toLowerCase() }
  );
  return rows[0] || null;
}

/**
 * Ensure a UserType-2 login account exists for a party (respondent or an
 * answerable member) so they can log in and respond to the written-statement /
 * Rule-12 query.
 *
 * Resolution order (mirrors the legacy tbl_Users rows):
 *   1) A verified user already has this email          -> reuse it
 *   2) A user already has this LoginID but a different
 *      Email column (legacy rows stored the wrong mail) -> repair the Email
 *   3) No account at all                                 -> insert a fresh one
 *
 * @param {object} party { name, email, mobile, membershipNo, city }
 * @returns {Promise<{user: object, created: boolean, repaired: boolean}|null>}
 */
async function ensurePartyUser(party) {
  if (!party) return null;
  const email = String(party.email || '').trim();
  if (!email) return null;

  const normalized = email.toLowerCase();

  const existing = await query(
    `SELECT TOP 1 UserID, LoginID, Email, NameOfTheUser, IsDeactivated
     FROM tbl_Users
     WHERE LOWER(LTRIM(RTRIM(Email)))=@e OR LOWER(LTRIM(RTRIM(LoginID)))=@e
     ORDER BY CASE WHEN LOWER(LTRIM(RTRIM(Email)))=@e THEN 0 ELSE 1 END, IsVerify DESC, UserID ASC`,
    { e: normalized }
  );

  if (existing.length) {
    const u = existing[0];
    let repaired = false;
    if (String(u.Email || '').trim().toLowerCase() !== normalized) {
      await executeNonQuery('UPDATE tbl_Users SET Email=@email WHERE UserID=@id', {
        email,
        id: u.UserID,
      });
      repaired = true;
    }
    return { user: u, created: false, repaired };
  }

  await executeNonQuery(
    `INSERT INTO tbl_Users (LoginID, NameOfTheUser, Email, Mob, MembershipNo, City, UserType, ASID, IsDeactivated, IsVerify)
     VALUES (@login, @name, @email, @mobile, @membershipNo, @city, 2, 1, 0, 1)`,
    {
      login: email,
      name: String(party.name || 'Respondent').trim(),
      email,
      mobile: party.mobile || null,
      membershipNo: party.membershipNo || null,
      city: party.city || null,
    }
  );

  const user = (await query('SELECT TOP 1 UserID, LoginID, Email, NameOfTheUser, IsDeactivated FROM tbl_Users WHERE LOWER(LTRIM(RTRIM(Email)))=@e', { e: normalized }))[0];
  return { user, created: true, repaired: false };
}

/**
 * Ensure a login account exists for a tbl_NewComplaint respondent row.
 * @param {object} row A tbl_NewComplaint row (must contain ResEmailID).
 */
async function ensureRespondentUserFromRow(row) {
  if (!row) return null;
  return ensurePartyUser({
    name: row.ResName || 'Respondent',
    email: row.ResEmailID,
    mobile: row.ResMobileNo,
    membershipNo: row.ResRegistrationNo,
    city: row.RCityName,
  });
}

/**
 * Ensure a login account exists for a tbl_AnswerableMember row.
 * @param {object} member Row with MemName/MemEmailID/MemRegistrationNo/MemMobileNo/MemCityName.
 */
async function ensureAnswerableUserFromMember(member) {
  if (!member) return null;
  return ensurePartyUser({
    name: member.MemName || 'Answerable Member',
    email: member.MemEmailID,
    mobile: member.MemMobileNo,
    membershipNo: member.MemRegistrationNo,
    city: member.MemCityName,
  });
}

/**
 * Ensure every answerable member of a firm complaint has a login account.
 * Called whenever answerable members are saved (complaint create/update or the
 * dedicated answerable-members endpoint).
 */
async function ensureAnswerableUsersForComplaint(compId) {
  if (!compId) return [];
  const rows = await query(
    `SELECT MemName, MemRegistrationNo, MemMobileNo, MemEmailID, MemCityName
     FROM tbl_AnswerableMember WHERE CompID=@id`,
    { id: Number(compId) }
  );
  const out = [];
  for (const row of rows) {
    const res = await ensureAnswerableUserFromMember(row);
    if (res) out.push(res);
  }
  return out;
}

/**
 * Ensure the respondent's login exists based on the respondent's email
 * (used by POST /api/auth/request-otp at login time). If the email is not the
 * named respondent it may still belong to an answerable member of a firm
 * complaint - those members are treated as respondents and get an account too.
 */
async function ensureRespondentUserByEmail(email) {
  const row = await lookupRespondentByEmail(email);
  if (row) return ensureRespondentUserFromRow(row);
  const member = await lookupAnswerableByEmail(email);
  return ensureAnswerableUserFromMember(member);
}

/**
 * Ensure the respondent's login exists for a specific complaint
 * (used by POST /api/complaints/:id/respondent-response at written-statement
 * submission time). This also covers the firm's answerable members.
 */
async function ensureRespondentUserForComplaint(compId) {
  const rows = await query(
    `SELECT TOP 1 CompID, ResName, ResRegistrationNo, ResMobileNo, ResEmailID, RCityName
     FROM tbl_NewComplaint
     WHERE CompID=@id AND (IsTemp IS NULL OR IsTemp = 0)`,
    { id: Number(compId) }
  );
  const respondent = await ensureRespondentUserFromRow(rows[0] || null);
  await ensureAnswerableUsersForComplaint(compId);
  return respondent;
}

module.exports = {
  ensureRespondentUserByEmail,
  ensureRespondentUserForComplaint,
  ensureAnswerableUserFromMember,
  ensureAnswerableUsersForComplaint,
};
