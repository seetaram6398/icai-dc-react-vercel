/**
 * Complaint access rules and document visibility.
 *
 * Internal staff (UserType 1 - Admin, 4 - DD, 5 - SO, 6 - BOD, 7 - Officer,
 * 8 - Committee, 9 - Suo Moto, 10 - Reporting Officer, 12 - Appellate Authority,
 * 13 - Working Officer) work on a complaint together: every document attached
 * by one department has to be visible to the others.
 *
 * The parties to a complaint - the complainant (UserType 3), the respondent and
 * the third party / answerable members (UserType 2) - never see the documents
 * attached by the internal users.  The only exception are the letters that are
 * formally communicated to them (query letters, rejoinder letters, the closure
 * letter and the clubbing communication), which are listed in
 * PARTY_COMMUNICATION_STATUSES.
 */

// Internal staff user types.
const INTERNAL_USER_TYPES = [1, 4, 5, 6, 7, 8, 9, 10, 12, 13];
// Users who are always treated as an outside party of a complaint.
const EXTERNAL_USER_TYPES = [2, 3, 11];

// Statuses at which the attachment is a communication issued TO a party.  Those
// documents stay visible to the party they were issued to.  Written Statement
// (status 15) is issued to the Respondent only, while the Rejoinder call
// (status 22) is issued to the Complainant only.
const PARTY_COMMUNICATION_STATUSES = [3, 13, 14, 15, 22, 51, 56, 66, 123];

const PARTY_ROLE_COMMUNICATION_STATUSES = {
  complainant: [3, 13, 14, 22, 51, 56, 66, 123],
  respondent: [15, 51],
  // Answerable members of a firm complaint act as respondents, so they must see
  // the written-statement query (status 15) issued to the firm.
  thirdparty: [15, 51],
};

// The parties an additional document can be called for from.
const AD_PARTIES = ['complainant', 'respondent', 'thirdparty'];

// The status a submission is recorded at, per party that furnishes it.
const SUBMIT_STATUS_PARTY = {
  52: 'complainant',
  131: 'respondent',
  132: 'thirdparty',
};

const AD_PARTY_LABELS = {
  complainant: 'the Complainant',
  respondent: 'the Respondent',
  thirdparty: 'the Third Party / Answerable Member',
};

function lower(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

/** Is the logged in user one of the internal staff? */
function isInternalUser(user) {
  if (!user) return false;
  return INTERNAL_USER_TYPES.includes(Number(user.UserType));
}

/**
 * Which party of this complaint is the logged in user?
 * @returns {'complainant'|'respondent'|'thirdparty'|null}
 */
function resolvePartyRole(user, complaint, answerable) {
  if (!user) return null;
  const email = lower(user.Email);
  const userId = Number(user.UserID);
  if (complaint && Number(complaint.UserID) === userId) return 'complainant';
  if (complaint && lower(complaint.ResEmailID) && lower(complaint.ResEmailID) === email) {
    return 'respondent';
  }
  const member = (answerable || []).find((m) => lower(m.MemEmailID) && lower(m.MemEmailID) === email);
  if (member) return 'thirdparty';
  return null;
}

/**
 * The first complainant of the complaint this one is clubbed with is treated as
 * a party as well (Rule 5(4) - the fact of clubbing is conveyed to the first
 * complainant, the new complainant and the respondent).
 */
function isClubbedComplainant(user, complaint) {
  const email = lower(user?.Email);
  if (!email || !complaint) return false;
  const clubbedEmail = lower(complaint.ClubbedWithComplainantEmail);
  return !!clubbedEmail && clubbedEmail === email;
}

/**
 * The status history rows a party of the complaint is allowed to see: the rows
 * they created themselves plus the letters issued to that specific party.
 */
function filterHistoryForParty(history, user, role) {
  const userId = Number(user?.UserID);
  const allowed = PARTY_ROLE_COMMUNICATION_STATUSES[role] || PARTY_COMMUNICATION_STATUSES;
  return (history || []).filter((row) => {
    const statusId = Number(row.StatusID);
    if (Number(row.UserID) === userId) {
      if (role === 'respondent' && statusId === 59) return false;
      if (role === 'thirdparty' && statusId === 59) return false;
      return true;
    }
    if (!allowed.includes(statusId)) return false;
    // The additional-document request (status 51) is only shown to the parties
    // it was actually raised against.
    if (statusId === 51) {
      const requested = parseAdRequest(row.CommonField);
      if (requested && !requested.includes(role)) return false;
    }
    // Status 59 moves the case to SO after documents are collected; the
    // respondent shouldn't see an internal assignment/status issued by/for staff.
    if (role === 'respondent' && statusId === 59) return false;
    if (role === 'thirdparty' && statusId === 59) return false;
    return true;
  });
}

/**
 * Documents attached by internal users - visible to the internal staff only.
 */
function buildInternalDocuments(history) {
  return (history || [])
    .filter((row) => row.Attachment && isInternalUser({ UserType: row.ByUserType }))
    .map((row) => ({
      CompStatusID: row.CompStatusID,
      StatusID: row.StatusID,
      StatusName: row.StatusName,
      StatusDate: row.StatusDate,
      Attachment: row.Attachment,
      Remarks: row.Remarks,
      ByUserName: row.ByUserName,
      ByUserType: row.ByUserType,
      // A letter issued to a party stays visible to that party as well.
      IsPartyCommunication: PARTY_COMMUNICATION_STATUSES.includes(Number(row.StatusID)),
    }));
}

/** Parse "ADReq=complainant;respondent" out of a status row CommonField. */
function parseAdRequest(commonField) {
  const m = /ADReq=([A-Za-z0-9_,;|]*)/i.exec(String(commonField || ''));
  if (!m) return null;
  const list = m[1]
    .split(/[,;|]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => AD_PARTIES.includes(s));
  return list.length ? Array.from(new Set(list)) : null;
}

/** Parse "ADSub=complainant" out of a status row CommonField. */
function parseAdSubmit(commonField) {
  const m = /ADSub=([A-Za-z0-9_,;|]*)/i.exec(String(commonField || ''));
  if (!m) return null;
  const list = m[1]
    .split(/[,;|]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? Array.from(new Set(list)) : null;
}

/**
 * State of the additional-document request that is currently open on the
 * complaint.  The request itself is stored on the status 51 row (CommonField =
 * "ADReq=...") and every submission is stored on a status 52 / 131 / 132 row
 * (CommonField = "ADSub=...").
 *
 * @returns {null|{RequestedFrom:string[],SubmittedBy:string[],Pending:string[],PendingEmails:string[],Complete:boolean}}
 */
function buildAdRequestState(history, answerable) {
  const rows = history || [];
  // The latest additional-document request on the case.
  const requestRows = rows.filter((row) => Number(row.StatusID) === 51);
  if (!requestRows.length) return null;
  const requestRow = requestRows.reduce((latest, row) =>
    Number(row.CompStatusID) > Number(latest.CompStatusID) ? row : latest
  );
  // A request raised before the multi-party facility existed carries no party
  // list - it was always a request from the Complainant.
  const requestedFrom = parseAdRequest(requestRow.CommonField) || ['complainant'];

  const submittedBy = new Set();
  const submittedEmails = new Set();
  for (const row of rows) {
    if (Number(row.CompStatusID) <= Number(requestRow.CompStatusID)) continue;
    if (![52, 131, 132].includes(Number(row.StatusID))) continue;
    // A submission raised before the multi-party facility existed carries no
    // marker - the status itself tells which party has furnished the document.
    const submitted = parseAdSubmit(row.CommonField) || [SUBMIT_STATUS_PARTY[Number(row.StatusID)]].filter(Boolean);
    submitted.forEach((p) => submittedBy.add(p));
    if (row.ByUserEmail) submittedEmails.add(lower(row.ByUserEmail));
  }

  // The third party is the set of answerable members of the complaint - every
  // one of them has to furnish the document.
  const thirdPartyEmails = (answerable || [])
    .map((m) => lower(m.MemEmailID))
    .filter(Boolean);

  const pending = [];
  const pendingEmails = [];
  requestedFrom.forEach((party) => {
    if (party === 'thirdparty') {
      const missing = thirdPartyEmails.filter((email) => !submittedEmails.has(email));
      if (missing.length) {
        pending.push('thirdparty');
        pendingEmails.push(...missing);
      }
      return;
    }
    if (!submittedBy.has(party)) pending.push(party);
  });

  return {
    RequestedFrom: requestedFrom,
    RequestCompStatusID: requestRow.CompStatusID,
    SubmittedBy: Array.from(submittedBy),
    Pending: pending,
    PendingEmails: pendingEmails,
    Complete: pending.length === 0,
    Labels: requestedFrom.map((p) => AD_PARTY_LABELS[p] || p),
  };
}

/**
 * Has this party already furnished the additional document?  Used to keep the
 * submission form from being offered again to a party that has already
 * submitted it.  Only the submissions made after the current request count.
 */
function viewerHasSubmitted(history, role, user, afterCompStatusId) {
  if (!role || !user) return false;
  const email = lower(user.Email);
  const userId = Number(user.UserID);
  const after = Number(afterCompStatusId || 0);
  return (history || []).some((row) => {
    if (after && Number(row.CompStatusID) <= after) return false;
    if (![52, 131, 132].includes(Number(row.StatusID))) return false;
    const submitted = parseAdSubmit(row.CommonField) || [SUBMIT_STATUS_PARTY[Number(row.StatusID)]].filter(Boolean);
    if (!submitted.includes(role)) return false;
    if (role === 'thirdparty') return lower(row.ByUserEmail) === email && !!email;
    return Number(row.UserID) === userId;
  });
}

module.exports = {
  INTERNAL_USER_TYPES,
  EXTERNAL_USER_TYPES,
  PARTY_COMMUNICATION_STATUSES,
  PARTY_ROLE_COMMUNICATION_STATUSES,
  AD_PARTIES,
  AD_PARTY_LABELS,
  isInternalUser,
  resolvePartyRole,
  isClubbedComplainant,
  filterHistoryForParty,
  buildInternalDocuments,
  parseAdRequest,
  parseAdSubmit,
  buildAdRequestState,
  viewerHasSubmitted,
};
