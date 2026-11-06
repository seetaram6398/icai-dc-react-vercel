const { query } = require('../config/db');
const {
  resolvePartyRole,
  buildAdRequestState,
  viewerHasSubmitted,
} = require('./complaintAccess');

// Statuses where a party has something to do before the case can move on:
//   3   - defect communicated to the complainant (complaint must be corrected)
//   15  - written statement sought from the respondent / answerable members
//   22  - rejoinder sought from the complainant
//   51  - additional documents sought from one or more parties
const PARTY_ACTION_STATUSES = [3, 15, 22, 51];

function alreadyFiledWrittenStatement(history, userId) {
  return (history || []).some(
    (row) => Number(row.StatusID) === 16 && Number(row.UserID) === Number(userId)
  );
}

function isActionPending(role, statusId, history, answerable, user) {
  const sid = Number(statusId);

  if (sid === 3 || sid === 22) return role === 'complainant';

  if (sid === 15) {
    if (!['respondent', 'thirdparty'].includes(role)) return false;
    return !alreadyFiledWrittenStatement(history, user.UserID);
  }

  if (sid === 51) {
    const state = buildAdRequestState(history, answerable);
    if (!state || !state.Pending.includes(role)) return false;
    return !viewerHasSubmitted(history, role, user, state.RequestCompStatusID);
  }

  return false;
}

/**
 * Complaint IDs where the logged-in complainant / respondent / answerable
 * member still has an action pending. Used by the dashboard "No Action Taken"
 * card and the complaint list filter.
 */
async function findPartyActionPendingIds(user) {
  const userId = Number(user?.UserID);
  const email = String(user?.Email || '').trim().toLowerCase();
  if (!userId || !email) return [];

  const complaints = await query(
    `SELECT DISTINCT nc.CompID, nc.UserID, nc.ResEmailID, nc.StatusID
     FROM tbl_NewComplaint nc
     WHERE (nc.IsTemp IS NULL OR nc.IsTemp=0)
       AND nc.StatusID IN (${PARTY_ACTION_STATUSES.join(',')})
       AND (
         nc.UserID=@userId
         OR LOWER(LTRIM(RTRIM(nc.ResEmailID)))=@email
         OR nc.CompID IN (
           SELECT am.CompID FROM tbl_AnswerableMember am
           WHERE LOWER(LTRIM(RTRIM(am.MemEmailID)))=@email
         )
       )`,
    { userId, email }
  );
  if (!complaints.length) return [];

  const ids = Array.from(new Set(complaints.map((c) => Number(c.CompID))));
  const params = {};
  const placeholders = ids
    .map((id, i) => {
      params[`id${i}`] = id;
      return `@id${i}`;
    })
    .join(',');

  const [historyRows, answerableRows] = await Promise.all([
    query(
      `SELECT cs.CompaintID, cs.CompStatusID, cs.StatusID, cs.UserID, cs.CommonField,
              u.Email AS ByUserEmail
       FROM tbl_ComplaintStatus cs
       LEFT JOIN tbl_Users u ON cs.UserID=u.UserID
       WHERE cs.CompaintID IN (${placeholders})`,
      params
    ),
    query(
      `SELECT CompID, MemEmailID FROM tbl_AnswerableMember
       WHERE CompID IN (${placeholders})`,
      params
    ),
  ]);

  const historyByComp = new Map();
  for (const row of historyRows) {
    const key = Number(row.CompaintID);
    if (!historyByComp.has(key)) historyByComp.set(key, []);
    historyByComp.get(key).push(row);
  }

  const answerableByComp = new Map();
  for (const row of answerableRows) {
    const key = Number(row.CompID);
    if (!answerableByComp.has(key)) answerableByComp.set(key, []);
    answerableByComp.get(key).push(row);
  }

  return complaints
    .filter((complaint) => {
      const history = historyByComp.get(Number(complaint.CompID)) || [];
      const answerable = answerableByComp.get(Number(complaint.CompID)) || [];
      const role = resolvePartyRole(user, complaint, answerable);
      return !!role && isActionPending(role, complaint.StatusID, history, answerable, user);
    })
    .map((complaint) => Number(complaint.CompID));
}

module.exports = { findPartyActionPendingIds };
