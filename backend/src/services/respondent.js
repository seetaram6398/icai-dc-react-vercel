const { query, executeNonQuery } = require('../config/db');

/**
 * Locate the most recent complaint whose respondent email matches, so a
 * respondent can be granted a login without first registering.
 */
async function lookupRespondentByEmail(email) {
  const rows = await query(
    `SELECT TOP 1 CompID, ResName, ResRegistrationNo, ResMobileNo, ResEmailID
     FROM tbl_NewComplaint
     WHERE LOWER(LTRIM(RTRIM(ResEmailID)))=@email AND (IsTemp IS NULL OR IsTemp = 0)
     ORDER BY CompID DESC`,
    { email: String(email).trim().toLowerCase() }
  );
  return rows[0] || null;
}

/**
 * Ensure a UserType-2 login account exists for a complaint's respondent so they
 * can log in and respond to the written-statement / Rule-12 query.
 *
 * Resolution order (mirrors the legacy tbl_Users rows):
 *   1) A verified user already has this email          -> reuse it
 *   2) A user already has this LoginID but a different
 *      Email column (legacy rows stored the wrong mail) -> repair the Email
 *   3) No account at all                                 -> insert a fresh one
 *
 * @param {object} row A tbl_NewComplaint row (must contain ResEmailID).
 * @returns {Promise<{user: object, created: boolean}|null>}
 */
async function ensureRespondentUserFromRow(row) {
  if (!row) return null;
  const email = String(row.ResEmailID || '').trim();
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
    `INSERT INTO tbl_Users (LoginID, NameOfTheUser, Email, Mob, MembershipNo, UserType, ASID, IsDeactivated, IsVerify)
     VALUES (@login, @name, @email, @mobile, @membershipNo, 2, 1, 0, 1)`,
    {
      login: email,
      name: String(row.ResName || 'Respondent').trim(),
      email,
      mobile: row.ResMobileNo || null,
      membershipNo: row.ResRegistrationNo || null,
    }
  );

  const user = (await query('SELECT TOP 1 UserID, LoginID, Email, NameOfTheUser, IsDeactivated FROM tbl_Users WHERE LOWER(LTRIM(RTRIM(Email)))=@e', { e: normalized }))[0];
  return { user, created: true, repaired: false };
}

/**
 * Ensure the respondent's login exists based on the respondent's email
 * (used by POST /api/auth/request-otp at login time).
 */
async function ensureRespondentUserByEmail(email) {
  const row = await lookupRespondentByEmail(email);
  return ensureRespondentUserFromRow(row);
}

/**
 * Ensure the respondent's login exists for a specific complaint
 * (used by POST /api/complaints/:id/respondent-response at written-statement
 * submission time).
 */
async function ensureRespondentUserForComplaint(compId) {
  const rows = await query(
    `SELECT TOP 1 CompID, ResName, ResRegistrationNo, ResMobileNo, ResEmailID
     FROM tbl_NewComplaint
     WHERE CompID=@id AND (IsTemp IS NULL OR IsTemp = 0)`,
    { id: Number(compId) }
  );
  return ensureRespondentUserFromRow(rows[0] || null);
}

module.exports = { ensureRespondentUserByEmail, ensureRespondentUserForComplaint };