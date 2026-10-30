/**
 * Access control for the document store (/documents/...).
 *
 * The complaint APIs already hide the documents of the internal departments
 * from the parties; this service closes the same door on the download route
 * itself, so that a document attached by an internal user cannot be opened by
 * the respondent, the complainant or the third party / answerable member even
 * if the file name is known.
 *
 * Rules
 *   - internal staff (Admin, DD, SO, Officer, RO, Committee, ...) may open
 *     every document of the complaint they work on;
 *   - a party may open the documents that were formally communicated to them
 *     (the query letter, the rejoinder, the closure letter, the clubbing
 *     communication ...) and the documents they uploaded themselves;
 *   - a party may open the documents that were filed with the complaint
 *     (the complaint form, the audio / video evidence);
 *   - anybody else is refused.
 *
 * A file that is not referenced by any of the known tables keeps the previous
 * behaviour (any authenticated user may open it) - those are the files that
 * are still being uploaded while a new complaint is being filed.
 */

const path = require('path');
const { query } = require('../config/db');
const {
  isInternalUser,
  resolvePartyRole,
  isClubbedComplainant,
  PARTY_COMMUNICATION_STATUSES,
  PARTY_ROLE_COMMUNICATION_STATUSES,
  parseAdRequest,
} = require('./complaintAccess');

function baseName(value) {
  return path.basename(String(value || '').replace(/\\/g, '/')).trim().toLowerCase();
}

/** The complaint (and its answerable members) a document belongs to. */
async function loadComplaint(compId) {
  if (!compId) return { complaint: null, answerable: [] };
  const complaint = await query('SELECT * FROM tbl_NewComplaint WHERE CompID=@id', { id: compId });
  const answerable = await query('SELECT * FROM tbl_AnswerableMember WHERE CompID=@id', { id: compId });
  return { complaint: complaint[0] || null, answerable };
}

/** Is the user one of the parties of this complaint? */
function isPartyOf(user, complaint, answerable) {
  if (!user || !complaint) return false;
  if (resolvePartyRole(user, complaint, answerable)) return true;
  // The first complainant of the complaint this one is clubbed with is a party.
  return isClubbedComplainant(user, complaint);
}

/**
 * May this user open a document attached to this status row?
 *   - internal staff: yes;
 *   - the party that uploaded it: yes (their own reply / submission);
 *   - the parties of the complaint: yes when the row is a communication issued
 *     to them.
 */
function canViewStatusAttachment(user, row, complaint, answerable) {
  if (!user || !row) return false;
  if (isInternalUser(user)) return true;
  if (Number(row.UserID) === Number(user.UserID)) return true;
  const role = resolvePartyRole(user, complaint, answerable) ||
    (isClubbedComplainant(user, complaint) ? 'complainant' : null);
  if (!role) return false;
  const allowed = PARTY_ROLE_COMMUNICATION_STATUSES[role] || PARTY_COMMUNICATION_STATUSES;
  const statusId = Number(row.StatusID);
  if (!allowed.includes(statusId)) return false;
  // The additional-document request (status 51) is only shown to the parties
  // it was actually raised against.
  if (statusId === 51) {
    const requested = parseAdRequest(row.CommonField);
    if (requested && !requested.includes(role)) return false;
  }
  return true;
}

/** Find the rows of a table that hold the given file name. */
async function findByFileName(sql, params, name) {
  const exact = await query(sql, { ...params, name });
  const hit = exact.find((row) => baseName(row.Attachment || row.DocURL) === name);
  if (hit) return hit;
  // Some rows store the file with its folder ("Folder/file.pdf").
  const looseSql = sql.replace('TOP 1', 'TOP 50').replace('= @name', 'LIKE @like');
  const loose = await query(looseSql, { ...params, like: '%' + name });
  return loose.find((row) => baseName(row.Attachment || row.DocURL) === name) || null;
}

/**
 * May this user open the document at `relPath`?
 * @returns {Promise<{allowed:boolean, reason?:string}>}
 */
async function checkDocumentAccess(user, relPath) {
  const name = baseName(relPath);
  if (!name) return { allowed: false, reason: 'Document not found' };

  // 1. Workflow attachments (tbl_ComplaintStatus) - the documents attached by
  //    the internal users while the complaint moved through the stages.
  const statusRow = await findByFileName(
    `SELECT TOP 1 CompStatusID, CompaintID, StatusID, UserID, CommonField, Attachment
     FROM tbl_ComplaintStatus
     WHERE Attachment IS NOT NULL AND LOWER(Attachment) = @name`,
    {},
    name
  );
  if (statusRow) {
    const { complaint, answerable } = await loadComplaint(statusRow.CompaintID);
    const allowed = canViewStatusAttachment(user, statusRow, complaint, answerable);
    return { allowed, reason: allowed ? '' : 'You are not allowed to view this document' };
  }

  // 2. Sub-attachments of a status row - they follow the status row.
  const subRow = await findByFileName(
    `SELECT TOP 1 AttachID, ComplaintID, CompStatusID, Attachment
     FROM tbl_ComplaintStatusAttachment
     WHERE Attachment IS NOT NULL AND LOWER(Attachment) = @name`,
    {},
    name
  );
  if (subRow) {
    const parent = await query(
      'SELECT TOP 1 CompStatusID, CompaintID, StatusID, UserID, CommonField FROM tbl_ComplaintStatus WHERE CompStatusID=@csid',
      { csid: subRow.CompStatusID }
    );
    const { complaint, answerable } = await loadComplaint(subRow.ComplaintID);
    const row = parent[0] || { StatusID: 0, UserID: 0 };
    const allowed = canViewStatusAttachment(user, row, complaint, answerable);
    return { allowed, reason: allowed ? '' : 'You are not allowed to view this document' };
  }

  // 3. The documents filed with the complaint (complaint form, evidence).
  const complaintDoc = await findByFileName(
    `SELECT TOP 1 CompAttachID, CompID, DocURL FROM tbl_ComplaintDocument
     WHERE DocURL IS NOT NULL AND LOWER(DocURL) = @name`,
    {},
    name
  );
  if (complaintDoc) {
    const { complaint, answerable } = await loadComplaint(complaintDoc.CompID);
    // The documents filed with the complaint belong to the complainant. The
    // respondent and the third party must not be able to open them.
    const allowed = isInternalUser(user) ||
      resolvePartyRole(user, complaint, answerable) === 'complainant';
    return { allowed, reason: allowed ? '' : 'You are not allowed to view this document' };
  }

  const avDoc = await findByFileName(
    `SELECT TOP 1 AttachID, ComplaintID, Attachment FROM tbl_AudioVideoAttachment
     WHERE Attachment IS NOT NULL AND LOWER(Attachment) = @name`,
    {},
    name
  );
  if (avDoc) {
    const { complaint, answerable } = await loadComplaint(avDoc.ComplaintID);
    const allowed = isInternalUser(user) ||
      resolvePartyRole(user, complaint, answerable) === 'complainant';
    return { allowed, reason: allowed ? '' : 'You are not allowed to view this document' };
  }

  // 4. The attachments carried on the complaint row itself.
  const complaintRow = await query(
    `SELECT TOP 1 CompID, BriefAttachment, MisconductAttachment, RegulatorAttachment,
            AadharPhoto, ComplaintantPhoto, ComplaintantSignature
     FROM tbl_NewComplaint
     WHERE LOWER(ISNULL(BriefAttachment,'')) = @name
        OR LOWER(ISNULL(MisconductAttachment,'')) = @name
        OR LOWER(ISNULL(RegulatorAttachment,'')) = @name
        OR LOWER(ISNULL(AadharPhoto,'')) = @name
        OR LOWER(ISNULL(ComplaintantPhoto,'')) = @name
        OR LOWER(ISNULL(ComplaintantSignature,'')) = @name
        OR LOWER(ISNULL(BriefAttachment,'')) LIKE '%/' + @name
        OR LOWER(ISNULL(MisconductAttachment,'')) LIKE '%/' + @name
        OR LOWER(ISNULL(RegulatorAttachment,'')) LIKE '%/' + @name
        OR LOWER(ISNULL(AadharPhoto,'')) LIKE '%/' + @name
        OR LOWER(ISNULL(ComplaintantPhoto,'')) LIKE '%/' + @name
        OR LOWER(ISNULL(ComplaintantSignature,'')) LIKE '%/' + @name`,
    { name }
  );
  if (complaintRow.length) {
    const { complaint, answerable } = await loadComplaint(complaintRow[0].CompID);
    const allowed = isInternalUser(user) ||
      resolvePartyRole(user, complaint, answerable) === 'complainant';
    return { allowed, reason: allowed ? '' : 'You are not allowed to view this document' };
  }

  // 5. Internal tables - the decision records, the stay applications, the
  //    cause lists, the findings and the adjournment attachments.
  const internalTables = [
    // The user column marks the party who filed the row (e.g. an answerable
    // member's written statement); that party may open their own attachment.
    ['tbl_ComplaintSubStatus', 'Attachment', 'UserID'],
    ['tbl_StayDetails', 'FilePath', null],
    ['tbl_Finding', 'FindingFile', null],
    ['tbl_CauseList', 'Attachment', null],
    ['tbl_AdjournmentAttachment', 'Attachment', null],
  ];
  for (const [table, column, userColumn] of internalTables) {
    const hit = await query(
      `SELECT TOP 1 CompID${userColumn ? `, ${userColumn} AS OwnerID` : ''} FROM ${table}
       WHERE ${column} IS NOT NULL AND LOWER(${column}) = @name`,
      { name }
    );
    if (hit.length) {
      const owned = !!userColumn && Number(hit[0].OwnerID) === Number(user.UserID);
      const allowed = isInternalUser(user) || owned;
      return { allowed, reason: allowed ? '' : 'You are not allowed to view this document' };
    }
  }

  // The decision taken at a hearing (tbl_Decision -> tbl_CauseList).
  const decisionHit = await query(
    `SELECT TOP 1 d.DecisionID FROM tbl_Decision d
     WHERE d.Attachment IS NOT NULL AND LOWER(d.Attachment) = @name`,
    { name }
  );
  if (decisionHit.length) {
    const allowed = isInternalUser(user);
    return { allowed, reason: allowed ? '' : 'You are not allowed to view this document' };
  }

  // 6. Not referenced anywhere - keep the previous behaviour.
  return { allowed: true };
}

module.exports = { checkDocumentAccess, isPartyOf, canViewStatusAttachment };
