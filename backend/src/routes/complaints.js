const express = require('express');
const { query, executeScalar, executeNonQuery } = require('../config/db');
const { authMiddleware } = require('../services/auth');
const { buildComplaintPdf } = require('../services/formPdf');
const { buildScrutinyPdf } = require('../services/scrutinyPdf');
const { buildScrutinyDefaults } = require('../services/scrutinyDefaults');
const {
  ensureRespondentUserForComplaint,
  ensureAnswerableUserFromMember,
  ensureAnswerableUsersForComplaint,
} = require('../services/respondent');
const { statusText } = require('../utils/statusText');
const {
  isInternalUser,
  resolvePartyRole,
  isClubbedComplainant,
  filterHistoryForParty,
  buildInternalDocuments,
  buildAdRequestState,
  viewerHasSubmitted,
  AD_PARTIES,
} = require('../services/complaintAccess');

const router = express.Router();
router.use(authMiddleware);

async function getComplaintAccess(req, id) {
  try {
    const rows = await query('SELECT CompID, UserID, ResEmailID, ClubbedWithCompID FROM tbl_NewComplaint WHERE CompID=@id', { id });
    if (rows.length === 0) return { allowed: false, reason: 'Complaint not found' };
    const c = rows[0];
    const answerable = await query('SELECT * FROM tbl_AnswerableMember WHERE CompID=@id', { id });
    let viewerRole = resolvePartyRole(req.user, c, answerable);
    const directComplainant = viewerRole === 'complainant';
    const viewerIsInternal = isInternalUser(req.user) && !viewerRole;
    if (!viewerIsInternal && !viewerRole) {
      const clubbedParty = isClubbedComplainant(req.user, c) ||
        (await query(
          'SELECT TOP 1 CompID FROM tbl_NewComplaint WHERE ClubbedWithCompID=@id AND UserID=@uid',
          { id, uid: Number(req.user.UserID) }
        )).length > 0;
      if (!clubbedParty) return { allowed: false, reason: 'Not allowed' };
      viewerRole = 'complainant';
    }
    return { allowed: true, viewerRole, viewerIsInternal, directComplainant, complaint: c };
  } catch (e) {
    return { allowed: false, reason: 'Server error' };
  }
}

// Rule 5(4) / Rule 6 - statuses at which a complaint is already clubbed or
// closed. A complaint sitting at one of these stages cannot take a new
// complaint on board: the new complaint has to be dealt with on its own
// merits (clubbing candidates are filtered out on the same list).
//   66 - Clubbing Decision, 68 - Recommended to Committee for Closure,
//   69 - Recommendation to Committee from DD, 123 - Clubbing Case Communicated,
//   13 - Closure communicated, 14 - Closed, 130 - Withdrawal permitted.
const CLUBBED_OR_CLOSED_STATUSES = [13, 14, 66, 68, 69, 123, 130];

// Helper: generate complaint number (mirrors original GetComplaintNo + PR/G/... formatting)
async function generateComplaintNo(isGov, year) {
  const r = await executeScalar(
    'SELECT ISNULL(MAX(CAST(ComplaintNo AS int)), 0) + 1 FROM tbl_NewComplaint WHERE Year=@year',
    { year }
  );
  const next = Number(r) || 1;
  const padded = String(next).padStart(3, '0');
  const compNo = `PR/${isGov ? 'G/' : ''}${padded}/${year}`;
  return { compNo, complaintNo: padded };
}

// DC Flow, step 1: "Complaint received -> DP (auto assign to a fixed SO) -> SO".
// Resolve the fixed Scrutiny Officer who receives every newly filed complaint.
//   1) If FIXED_SO_EMAIL is configured in .env, that SO is always used.
//   2) Otherwise pick the SO (UserType 5) currently carrying the least open
//      scrutiny work, tie-broken by lowest UserID so the result is stable.
async function resolveFixedSO() {
  const fixedEmail = (process.env.FIXED_SO_EMAIL || '').trim().toLowerCase();
  let rows = null;
  if (fixedEmail) {
    rows = await query(
      'SELECT UserID FROM tbl_Users WHERE UserType=5 AND LOWER(LTRIM(RTRIM(Email)))=@email AND IsDeactivated=0',
      { email: fixedEmail }
    );
  }
  if (!rows || rows.length === 0) {
    rows = await query(
      `SELECT TOP 1 u.UserID
       FROM tbl_Users u
       LEFT JOIN (
         SELECT cs.UserToID, COUNT(*) AS open_count
         FROM tbl_ComplaintStatus cs
         WHERE cs.StatusID IN (2, 4, 53, 66)
           AND cs.CompaintID IN (SELECT CompID FROM tbl_NewComplaint)
         GROUP BY cs.UserToID
       ) t ON t.UserToID = u.UserID
       WHERE u.UserType = 5 AND u.IsDeactivated = 0
       ORDER BY ISNULL(t.open_count, 0) ASC, u.UserID ASC`
    );
  }
  return rows.length ? Number(rows[0].UserID) : null;
}

// Build shared complaint-list SQL mirroring the ASPX filter pages.
// RO (Reporting Officer) default view matches ViewComplaintReportingOfficer.aspx:
// complaints at StatusID 49 that are assigned to this RO (status 49/54/57),
// plus optional free-text search and entry-date range.
// Deduplication is done FIRST, globally by CompNo (keeping the latest record),
// then all filters are applied on the deduped set — exactly like the dashboard —
// so Dashboard counts always match what the complaint window displays.
function buildListQuery(filters, user) {
  const { statusIds, assignedTo, complainantId, respondentFor, search, dateFrom, dateTo } = filters;
  let sqlStr = `
      SELECT CompID, CompNo, ResName, FirmNo, IsFirm, EntryDate, StatusID,
             StatusName, CompTypeName, ComplainantName, DaysSinceEntry,
             TaxableAmount, IsStay, EmailID, MobileNo, ResMobileNo, ResProfAddress,
             Address, Landmark, Region, RStateName, RCityname, RelationName,
             AadharNo, GSTINNo, ResLandlineNo, FormType, NameofFirm, ResRegistrationNo,
             ClubbedWithCompID, ClubbedWithCompNo, ClubRule, ClubbedAgainstCount
      FROM (
        SELECT nc.CompID, nc.CompNo, nc.ResName, nc.FirmNo, nc.IsFirm, nc.EntryDate, nc.StatusID,
               nc.TaxableAmount, nc.IsStay, nc.EmailID, nc.MobileNo, nc.ResMobileNo,
               nc.ResProfAddress, nc.Address, nc.Landmark, nc.Region, nc.RStateName,
               nc.RCityname, nc.RelationName, nc.AadharNo, nc.GSTINNo, nc.ResLandlineNo,
               nc.FormType, nc.NameofFirm, nc.ResRegistrationNo, nc.UserID, nc.Name,
               nc.ClubbedWithCompID, nc.ClubRule,
               pc.CompNo AS ClubbedWithCompNo,
               (SELECT COUNT(*) FROM tbl_NewComplaint x
                 WHERE x.ClubbedWithCompID = nc.CompID AND (x.IsTemp IS NULL OR x.IsTemp=0)) AS ClubbedAgainstCount,
               sm.StatusName, ct.CompTypeName, u.NameOfTheUser AS ComplainantName,
               CAST(DATEDIFF(day, nc.EntryDate, GETDATE()) AS int) AS DaysSinceEntry,
               ROW_NUMBER() OVER (
                 PARTITION BY ISNULL(nc.CompNo, CONVERT(varchar(50), nc.CompID))
                 ORDER BY (SELECT MAX(cs.StatusDate) FROM tbl_ComplaintStatus cs WHERE cs.CompaintID = nc.CompID) DESC, nc.CompID DESC
               ) AS __rn
        FROM tbl_NewComplaint nc
        INNER JOIN tbl_StatusMaster sm ON nc.StatusID = sm.StatusID
        LEFT JOIN tbl_CompType ct ON nc.CompType = ct.CompTypeID
        LEFT JOIN tbl_Users u ON nc.UserID = u.UserID
        LEFT JOIN tbl_NewComplaint pc ON nc.ClubbedWithCompID = pc.CompID
        WHERE nc.IsTemp IS NULL OR nc.IsTemp = 0) t`;
  const params = {};
  const conds = [];

  let ids = statusIds ? String(statusIds).split(',').map(Number).filter(Boolean) : [];
  if (Number(user.UserType) === 10 && !ids.length) {
    ids = [49, 54, 57];
    conds.push(`t.CompID IN (
          SELECT CompaintID FROM tbl_ComplaintStatus
          WHERE UserToID=@roId AND UserToID IS NOT NULL AND StatusID IN (49,54,57))`);
    params.roId = Number(user.UserID);
  }
  if (ids.length) {
    conds.push(`t.StatusID IN (${ids.map((_, i) => `@s${i}`).join(',')})`);
    ids.forEach((id, i) => (params[`s${i}`] = id));
  }
  // Respondents (UserType 2) must always be scoped to their own complaints —
  // those they filed, the cases where they are the named respondent
  // (ResEmailID), or an answerable member — so the list and the CSV export can
  // never leak unrelated cases.
  if (Number(user.UserType) === 2) {
    const respEmail = String(user.Email || '').trim().toLowerCase();
    params.ownUserId = Number(user.UserID);
    const ownCases = [`t.UserID=@ownUserId`];
    if (respEmail) {
      ownCases.push(`t.CompID IN (
          SELECT CompID FROM tbl_AnswerableMember WHERE LOWER(LTRIM(RTRIM(MemEmailID)))=@respEmail
          UNION
          SELECT CompID FROM tbl_NewComplaint WHERE LOWER(LTRIM(RTRIM(ResEmailID)))=@respEmail AND (IsTemp IS NULL OR IsTemp=0))`);
      params.respEmail = respEmail;
    }
    conds.push(`(${ownCases.join(' OR ')})`);
  }
  // Non-member / member complainants (UserType 3) must never see the internal
  // list or CSV export of cases they did not file. The frontend already sends
  // ?complainantId=my id; enforce it here so the API cannot be called to dump
  // other people's complaints.
  if (Number(user.UserType) === 3) {
    conds.push(`t.UserID=@ownUserId`);
    params.ownUserId = Number(user.UserID);
  }
  if (assignedTo) {
    conds.push(`t.CompID IN (SELECT CompaintID FROM tbl_ComplaintStatus WHERE UserToID=@assignedTo AND UserToID IS NOT NULL)`);
    params.assignedTo = Number(assignedTo);
  }
  if (complainantId) {
    conds.push(`t.UserID=@complainantId`);
    params.complainantId = Number(complainantId);
  }
  if (respondentFor) {
    // Complaints where the logged-in party is the respondent (ResEmailID) or an
    // answerable member — so respondents can see their cases after logging in.
    const ownCase = Number(user.UserType) === 2 ? ' OR t.UserID=@ownUserId' : '';
    conds.push(`(t.CompID IN (
        SELECT CompID FROM tbl_AnswerableMember WHERE LOWER(LTRIM(RTRIM(MemEmailID)))=@respEmail
        UNION
        SELECT CompID FROM tbl_NewComplaint WHERE LOWER(LTRIM(RTRIM(ResEmailID)))=@respEmail)${ownCase})`);
    params.respEmail = String(respondentFor).trim().toLowerCase();
    if (Number(user.UserType) === 2) params.ownUserId = Number(user.UserID);
  }
  if (search) {
    const like = `%${String(search).trim()}%`;
    conds.push(`(t.Name LIKE @search OR t.EmailID LIKE @search OR t.MobileNo LIKE @search
        OR t.Address LIKE @search OR t.Landmark LIKE @search OR t.AadharNo LIKE @search
        OR t.ResName LIKE @search OR t.ResMobileNo LIKE @search OR t.ResProfAddress LIKE @search
        OR t.GSTINNo LIKE @search OR t.Region LIKE @search OR t.RStateName LIKE @search
        OR t.RCityname LIKE @search OR t.RelationName LIKE @search OR t.CompNo LIKE @search
        OR t.ResLandlineNo LIKE @search)`);
    params.search = like;
  }
  if (dateFrom) {
    conds.push(`t.EntryDate >= @dateFrom`);
    params.dateFrom = `${dateFrom} 00:00:00`;
  }
  if (dateTo) {
    conds.push(`t.EntryDate <= @dateTo`);
    params.dateTo = `${dateTo} 23:59:59`;
  }
  sqlStr += conds.length ? ` WHERE t.__rn = 1 AND ${conds.join(' AND ')} ORDER BY t.EntryDate DESC` : ` WHERE t.__rn = 1 ORDER BY t.EntryDate DESC`;
  return { sqlStr, params };
}

// Escape a value for a CSV cell
function csvCell(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// Resolve the SO who was assigned when the written statement query was sought
// (Status 50 → Seek Written Statement from the Respondent). Mirrors the ASPX
// loadBeforeDetails("50", compID) used by UpdateStatus for Status 16 / 63, so
// the respondent's reply (written statement or Rule-12 application) routes back
// to that same SO.
async function resolveSOFromStatement(compId) {
  const rows = await query(
    `SELECT TOP 1 UserToID FROM tbl_ComplaintStatus
     WHERE CompaintID=@id AND StatusID=50 AND UserToID IS NOT NULL
     ORDER BY CompStatusID DESC`,
    { id: compId }
  );
  return rows.length ? rows[0].UserToID : null;
}

/**
 * GET /api/complaints
 * List complaints by status/role. Mirrors ViewComplaintsToSO / ViewComplaintOfficer etc.
 * Query: ?statusIds=2,3,4 & assignedTo=UserID & search=text & dateFrom/dateTo=YYYY-MM-DD
 */
router.get('/', async (req, res) => {
  try {
    const { statusIds, assignedTo, complainantId, respondentFor, search, dateFrom, dateTo } = req.query;
    const { sqlStr, params } = buildListQuery(
      { statusIds, assignedTo, complainantId, respondentFor, search, dateFrom, dateTo },
      req.user
    );
    const rows = await query(sqlStr, params);
    res.json(rows);
  } catch (e) {
    console.error('list complaints error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/complaints/export
 * CSV export of the same complaint list using the same filters.
 */
router.get('/export', async (req, res) => {
  try {
    const { statusIds, assignedTo, complainantId, search, dateFrom, dateTo } = req.query;
    const { sqlStr, params } = buildListQuery(
      { statusIds, assignedTo, complainantId, search, dateFrom, dateTo },
      req.user
    );
    const rows = await query(sqlStr, params);

    const header = [
      'Complaint No',
      'Type of Respondent',
      'Complainant Name',
      'Complainant Email',
      'Complainant Mobile',
      'Respondent Name/Firm Name',
      'Respondent Mobile',
      'Respondent Professional Address',
      'Fee Paid (TaxableAmount)',
      'Current Status',
      'Is Stay',
      'Date of Receipt of Complaint (dd/MM/yyyy)',
      'Address',
      'Landmark',
      'Region',
      'Respondent State',
      'Respondent City',
      'Relation Name',
      'Aadhar No',
      'GSTIN No',
    ];
    const columns = [
      'CompNo',
      'CompTypeName',
      'ComplainantName',
      'EmailID',
      'MobileNo',
      'ResName',
      'ResMobileNo',
      'ResProfAddress',
      'TaxableAmount',
      'StatusName',
      'IsStay',
      'EntryDate',
      'Address',
      'Landmark',
      'Region',
      'RStateName',
      'RCityname',
      'RelationName',
      'AadharNo',
      'GSTINNo',
    ];

    // The exported sheet is user-facing, so the internal classification words
    // are neutralised here too (the API keeps returning the raw names for the
    // <select> values).
    const esc = (r, c) => {
      if (c === 'StatusName') return csvCell(statusText(r[c]));
      return c === 'EntryDate' ? csvCell(fmtDate(r[c])) : csvCell(r[c]);
    };
    const lines = [header.map(csvCell).join(',')];
    for (const r of rows) {
      lines.push(columns.map((c) => esc(r, c)).join(','));
    }

    const filename = `Complaint_Data_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send('\uFEFF' + lines.join('\r\n'));
  } catch (e) {
    console.error('export complaints error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

function h(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Shared page builder for the Download Form / Download Compilation documents.
// Mirrors the original ASPX PreviewComplaint.aspx layout (Sections I–IX) so the
// saved/printed form shows every field in the same arrangement as the old
// portal. Produces a print-ready HTML file that opens cleanly in Word/browsers.
async function buildDownloadDoc(id, kind, origin) {
  const rows = await query(
    `SELECT nc.*, sm.StatusName, ct.CompTypeName,
            u.NameOfTheUser AS ComplainantName, u.Email AS ComplainantEmail, u.Mob AS ComplainantMobile,
            pm.PaymentModeName,
            sc.StateName AS ComplainantStateName, cc.CityName AS ComplainantCityName,
            sf.StateName AS FirmStateName, cf.CityName AS FirmCityName,
            sr.StateName AS ComStateName, cr.CityName AS ComCityName,
            rg.RegulatorName AS RegulatorNameMaster
     FROM tbl_NewComplaint nc
     LEFT JOIN tbl_StatusMaster sm ON nc.StatusID = sm.StatusID
     LEFT JOIN tbl_CompType ct ON nc.CompType = ct.CompTypeID
     LEFT JOIN tbl_Users u ON nc.UserID = u.UserID
     LEFT JOIN tbl_PaymentMode pm ON nc.PaymentMode = pm.PaymentModeID
     LEFT JOIN tbl_StateMaster sc ON nc.StateID = sc.StateID
     LEFT JOIN tbl_CityMaster cc ON nc.CityID = cc.CityID
     LEFT JOIN tbl_StateMaster sf ON nc.FirmProfStateID = sf.StateID
     LEFT JOIN tbl_CityMaster cf ON nc.FirmProfCityID = cf.CityID
     LEFT JOIN tbl_StateMaster sr ON nc.RStateID = sr.StateID
     LEFT JOIN tbl_CityMaster cr ON nc.RCityID = cr.CityID
     LEFT JOIN tbl_Regulator rg ON nc.RegulatorID = rg.RegulatorID
     WHERE nc.CompID=@id`,
    { id }
  );
  if (rows.length === 0) return null;
  const c = rows[0];
  const isFirm = Number(c.IsFirm) === 1;

  let history = [];
  if (kind === 'compilation') {
    history = await query(
      `SELECT cs.StatusDate, cs.StatusID, cs.Remarks, cs.Attachment, cs.CommonField, cs.ExtensionTime,
              sm.StatusName, u.NameOfTheUser AS AssignedBy
       FROM tbl_ComplaintStatus cs
       INNER JOIN tbl_StatusMaster sm ON cs.StatusID = sm.StatusID
       LEFT JOIN tbl_Users u ON cs.UserID = u.UserID
       WHERE cs.CompaintID=@id ORDER BY cs.CompStatusID`,
      { id }
    );
  }
  const [documents, factPersons, answerable, audioVideo, schedules] = await Promise.all([
    query('SELECT DocumentID, DocURL FROM tbl_ComplaintDocument WHERE CompID=@id', { id }),
    query('SELECT PersonName, PersonMobile, PersonEmail FROM tbl_FactPersons WHERE CompID=@id', { id }),
    query('SELECT AMemID, MemName, MemRegistrationNo, MemMobileNo, MemEmailID, IsSenior FROM tbl_AnswerableMember WHERE CompID=@id', { id }),
    query('SELECT Attachment FROM tbl_AudioVideoAttachment WHERE ComplaintID=@id', { id }),
    query(
      `SELECT ScheduleName, PartNo, ItemName, Miscondate, MisconductDate, MisconductDateTo
       FROM vw_ScheduleList WHERE CompID=@id`,
      { id }
    ),
  ]);

  const docRoot = `${origin || ''}/documents`;
  const rel = (v) => (v == null ? '' : String(v).replace(/\\/g, '/'));
  const docHref = (v) => {
    const p = rel(v);
    return p.trim() ? `${docRoot}/${encodeURI(p)}` : '';
  };
  const docAnchor = (v) => (docHref(v) ? `<a class="doc-link" href="${docHref(v)}" target="_blank">View Document</a>` : '');
  const fileLink = (v) => (docHref(v) ? `<a class="doc-link" href="${docHref(v)}" target="_blank">${h(rel(v).split('/').pop())}</a>` : '');
  const fmtD = (v) => (v ? new Date(v).toLocaleDateString('en-GB') : '—');
  const val = (v) => (v == null || String(v).trim() === '' ? '&nbsp;' : h(v));

  // Print / form helpers ---------------------------------------------------
  const fc = (label, value, span) =>
    `<td class="f"${span ? ` colspan="${span}"` : ''}><div class="f-lbl">${label}</div><div class="f-val">${value == null || value === '' ? '&nbsp;' : value}</div></td>`;
  const fr = (cells) => `<tr>${cells.join('')}</tr>`;
  const grid = (headers, rowList) =>
    `<table class="grid"><thead><tr>${headers.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>` +
    (rowList.length
      ? rowList.map((r) => `<tr>${r.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${headers.length}" class="empty">No records available.</td></tr>`) +
    `</tbody></table>`;
  const imgCell = (src, label) => {
    const url = docHref(src);
    return `<div class="img-label">${label}</div>${url ? `<img class="img-prev" src="${url}" alt="${h(label)}" />` : '<div class="f-val muted">No Image</div>'}`;
  };
  const section = (title, body) => `<h2 class="sec">${title}</h2>${body}`;

  const showPayment = !['Central Goverment', 'State Goverment', 'Regulatory Authority', 'Regulatory Agency']
    .some((t) => String(c.CompTypeName || '').trim().toLowerCase() === t.toLowerCase());
  const isIndividual = String(c.CompTypeName || '').trim().toLowerCase() === 'individual';

  // ----- Document assembly -----
  const genericInfo =
    fr([fc('Complaint No.', val(c.CompNo)), fc('Form Type', val(c.FormType)), fc('Complaint Type', val(c.CompTypeName)), fc('Status', val(statusText(c.StatusName)))]) +
    (c.ComplainantName
      ? fr([fc('Filed By', val(c.ComplainantName)), fc('Entry Date', val(c.EntryDate ? new Date(c.EntryDate).toLocaleDateString('en-GB') : '')), fc('', ''), fc('', '')])
      : '');

  const secI = section(
    'I. Particulars of the Complaint / Information',
    fr([fc('Type of Complaint', val(c.CompTypeName)), fc('Name', val(c.Name)), fc('Email ID', val(c.EmailID))]) +
    (isIndividual
      ? fr([fc('S/D/O', val(c.Salutation)), fc('Relation Name', val(c.RelationName)), fc('', '')])
      : fr([fc('Regulator', val(c.RegulatorNameMaster)), fc('Name of Regulator', val(c.RegulatorName)), fc('Designation', val(c.RegulatorDesignation))]) +
        fr([fc('Authorization Letter', docAnchor(c.RegulatorAttachment), 3)])) +
    fr([fc('Membership No.', val(c.CompMembershipNo)), fc('Country Code', val(c.CountryCode)), fc('Mobile No', val(c.MobileNo))]) +
    fr([fc('STD Code', val(c.STDCode)), fc('Landline No', val(c.LandlineNo)), fc('', '')]) +
    fr([fc('Flat, House no., Building, Company, Apartment', val(c.Address)), fc('Area, Street, Sector, Village', val(c.Area)), fc('Landmark', val(c.Landmark))]) +
    fr([fc('State', val(c.ComplainantStateName)), fc('City', val(c.ComplainantCityName)), fc('Pincode', val(c.PinCode))]) +
    fr([fc('Region', val(c.Region)), fc('Aadhar/PAN/Employee-ID No.', val(c.AadharNo)), fc('', '')]) +
    fr([fc(imgCell(c.AadharPhoto, 'Complainant Aadhar/PAN/Employee-ID Photo')), fc(imgCell(c.ComplaintantPhoto, 'Complainant Photo')), fc(imgCell(c.ComplaintantSignature, 'Complainant Signature'))])
  );

  const secII = section(
    'II. Particulars of the Respondent',
    fr([fc('Respondent', isFirm ? 'Firm' : 'Member'), fc('', ''), fc('', '')]) +
    (isFirm
      ? fr([fc('Name of Firm', val(c.NameofFirm)), fc('Firm No.', val(c.FirmNo)), fc('', '')])
      : fr([fc('Name', val(c.ResName)), fc('Membership Number', val(c.ResRegistrationNo)), fc('', '')])) +
    fr([fc('Country Code', val(c.ResCountryCode)), fc('Mobile No', val(c.ResMobileNo)), fc('STD Code', val(c.ResSTDCode))]) +
    fr([fc('Landline No', val(c.ResLandlineNo)), fc('', ''), fc('', '')]) +
    fr([fc('Professional Address', val(c.ResProfAddress)), fc('Communication Address', val(c.ResCommAddress)), fc('', '')]) +
    fr([
      fc('Professional State', val(isFirm ? c.FirmStateName : c.RStateName)),
      fc('Professional City', val(isFirm ? c.FirmCityName : c.RCityname)),
      fc('Communication State', val(c.ComStateName)),
    ]) +
    fr([fc('Communication City', val(c.ComCityName)), fc('Professional Region', val(c.RRegion)), fc('Communication Region', val(c.RComRegion))]) +
    fr([fc('Email ID', val(c.ResEmailID), 3)])
  );

  let secIII = '';
  if (isFirm) {
    secIII = section(
      'III. Answerable Members',
      grid(['Name', 'Membership No', 'Mobile No', 'Email ID'],
        answerable.map((m) => [val(m.MemName), val(m.MemRegistrationNo), val(m.MemMobileNo), val(m.MemEmailID)]))
    );
  }

  const secIV = section(
    'IV. Particulars of Complaint',
    fr([fc('Brief Fact Statement', `${h(c.BriefStatement || '')} ${docAnchor(c.BriefAttachment)}`)]) +
    fr([fc('Particular of Misconduct', `${h(c.ParticularMisconduct || '')} ${docAnchor(c.MisconductAttachment)}`)])
  );

  const secV = section(
    'V. Name of person who have knowledge of the facts of the case',
    grid(['Name', 'Mobile', 'Email'],
      factPersons.map((p) => [val(p.PersonName), val(p.PersonMobile), val(p.PersonEmail)]))
  );

  const secVI = section(
    'VI. Investigation Report',
    fr([fc('Investigation Report', c.InvestigatingReport ? docAnchor(c.InvestigatingReport) : 'Not Available', 2)]) +
    fr([fc('Investigation Report Available', c.IsInvestigatingReportAvailable == null ? '&nbsp;' : (Number(c.IsInvestigatingReportAvailable) === 1 ? 'Yes' : 'No'), 2)])
  );

  const secVII = section(
    'VII. The alleged misconduct falls under',
    grid(['Schedule Name', 'Part No', 'Item Name', 'Misconduct Date', 'Misconduct Period From', 'Misconduct Period To'],
      schedules.map((s) => [val(s.ScheduleName), val(s.PartNo), val(s.ItemName), val(s.Miscondate ? fmtD(s.Miscondate) : '—'), val(s.MisconductDate ? fmtD(s.MisconductDate) : '—'), val(s.MisconductDateTo ? fmtD(s.MisconductDateTo) : '—')]))
  );

  const secVIII = showPayment
    ? section(
        'VIII. Payment Details',
        fr([fc('Mode of Payment', val(c.PaymentModeName)), fc('Payment Date', val(c.PaymentDate ? fmtD(c.PaymentDate) : '—')), fc('Transaction Reference No', val(c.TransRefNo)), fc('GST Number', val(c.GSTINNo))]) +
        fr([fc('Instrument Number', val(c.InstrumentNo)), fc('Instrument Date', val(c.InstrumentDate ? fmtD(c.InstrumentDate) : '—')), fc('Taxable Amount', val(c.TaxableAmount)), fc('GST Type', val(c.GSTType))]) +
        fr([fc('Tax Rate', val(c.TaxRate)), fc('Payment Details Like DD', val(c.PaymentDetails)), fc('', ''), fc('', '')])
      )
    : '<h2 class="sec">VIII. Payment Details</h2><p class="muted">Payment Details Not Available</p>';

  const secIX =
    section(
      'IX. Document / Evidence',
      grid(['Sr.No.', 'Doc Name', 'View Document'],
        documents.map((d, i) => [i + 1, val(d.DocumentID), fileLink(d.DocURL)]))
    ) +
    '<br />' +
    section(
      'Audio / Video Evidence',
      grid(['Sr.No.', 'File'],
        audioVideo.map((a, i) => [i + 1, fileLink(a.Attachment)]))
    );

  const historyHtml = kind === 'compilation'
    ? section(
        'Status History',
        grid(['Status', 'Date', 'By', 'Remarks', 'Common Field', 'Extension Days', 'Attachment'],
          history.map((r) => [
            val(statusText(r.StatusName)),
            val(r.StatusDate ? new Date(r.StatusDate).toLocaleString('en-GB') : '—'),
            val(r.AssignedBy),
            val(statusText(r.Remarks)),
            val(statusText(r.CommonField)),
            val(r.ExtensionTime),
            r.Attachment ? fileLink(r.Attachment) : '&nbsp;',
          ]))
      )
    : '';

  const title = kind === 'compilation' ? 'Case Compilation' : 'Complaint Form';
  return `
<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${title} - ${h(c.CompNo || id)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12.5px; color: #111; margin: 22px 30px; line-height: 1.35; }
  .doc-head { text-align: center; border-bottom: 2px solid #001e40; padding-bottom: 10px; margin-bottom: 14px; }
  .doc-head h1 { margin: 0; font-size: 20px; color: #001e40; letter-spacing: 0.4px; }
  .doc-head .sub { color: #333; font-size: 13px; margin-top: 4px; }
  .doc-head .meta { color: #666; font-size: 11.5px; margin-top: 6px; }
  .no-print { text-align: right; margin-bottom: 10px; }
  .no-print button { padding: 6px 16px; font-size: 12.5px; cursor: pointer; }
  h2.sec { font-size: 12.5px; background: #001e40; color: #fff; padding: 6px 10px; margin: 18px 0 2px; letter-spacing: 0.3px; }
  h2.sub-sec { font-size: 12px; color: #001e40; margin: 10px 0 2px; }
  table.f { border-collapse: collapse; width: 100%; }
  table.f td.f { border: 1px solid #b9bfc9; padding: 6px 9px; vertical-align: top; }
  .f-lbl { font-weight: 700; color: #274060; font-size: 11px; margin-bottom: 2px; }
  .f-val { color: #111; font-weight: 500; word-break: break-word; }
  table.grid { border-collapse: collapse; width: 100%; margin: 6px 0 4px; }
  table.grid th { background: #eef1f6; border: 1px solid #b9bfc9; padding: 6px 8px; text-align: left; }
  table.grid td { border: 1px solid #b9bfc9; padding: 6px 8px; vertical-align: top; }
  td.empty { text-align: center; color: #777; }
  a.doc-link { color: #1a4a8a; text-decoration: underline; }
  .muted { color: #777; }
  .img-prev { height: 110px; width: 125px; object-fit: cover; border: 1px solid #ccc; }
  .img-label { font-size: 11px; font-weight: 700; color: #274060; margin-bottom: 4px; display: block; }
  @media print { .no-print { display: none; } body { margin: 10mm; } }
</style>
</head>
<body>
  <div class="no-print"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>
  <div class="doc-head">
    <h1>THE INSTITUTE OF CHARTERED ACCOUNTANTS OF INDIA</h1>
    <div class="sub">Disciplinary Directorate &mdash; ${title}</div>
    <div class="meta">${h(c.CompNo || '')} &middot; Generated on ${new Date().toLocaleString('en-GB')}</div>
  </div>
  <table class="f">${genericInfo}</table>
  ${secI}
  ${secII}
  ${secIII}
  ${secIV}
  ${secV}
  ${secVI}
  ${secVII}
  ${secVIII}
  ${secIX}
  ${historyHtml}
</body></html>`;
}

/**
 * GET /api/complaints/:id/form/pdf
 * Download the complaint form + all uploaded documents merged into a single PDF.
 */
router.get('/:id/form/pdf', async (req, res) => {
  try {
    const access = await getComplaintAccess(req, req.params.id);
    if (!access.allowed) return res.status(403).json({ error: 'Not allowed' });
    if (!(access.viewerIsInternal || access.directComplainant)) return res.status(403).json({ error: 'Not allowed' });
    const out = await buildComplaintPdf(req.params.id);
    if (!out || !out.data) return res.status(404).json({ error: 'Complaint not found' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${out.filename}`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(out.data));
  } catch (e) {
    console.error('complaint pdf error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/complaints/:id/compilation/pdf
 * Download the complaint compilation (Form A + status history + all documents) as a single PDF.
 */
router.get('/:id/compilation/pdf', async (req, res) => {
  try {
    const access = await getComplaintAccess(req, req.params.id);
    if (!access.allowed) return res.status(403).json({ error: 'Not allowed' });
    if (!access.viewerIsInternal) return res.status(403).json({ error: 'Not allowed' });
    const out = await buildComplaintPdf(req.params.id, { includeHistory: true });
    if (!out || !out.data) return res.status(404).json({ error: 'Complaint not found' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Compilation_${out.filename}`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(out.data));
  } catch (e) {
    console.error('complaint compilation pdf error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/complaints/:id/scrutiny/prefill
 * Auto-filled Scrutiny Sheet. Saved answers win over the defaults so the form
 * always opens showing what is currently on record for this complaint.
 */
router.get('/:id/scrutiny/prefill', async (req, res) => {
  try {
    const access = await getComplaintAccess(req, req.params.id);
    if (!access.allowed) return res.status(403).json({ error: 'Not allowed' });
    if (!access.viewerIsInternal) return res.status(403).json({ error: 'Not allowed' });
    const id = req.params.id;
    const rows = await query(
      `SELECT nc.*, ct.CompTypeName,
              u.NameOfTheUser AS ComplainantName, u.Email AS ComplainantEmail, u.Mob AS ComplainantMobile,
              u.MembershipNo AS ComplainantMembershipNo, u.Address AS ComplainantAddress, u.Area AS ComplainantArea,
              u.Landmark AS ComplainantLandmark, u.City AS ComplainantCity, u.Pincode AS ComplainantPincode
       FROM tbl_NewComplaint nc
       LEFT JOIN tbl_CompType ct ON nc.CompType = ct.CompTypeID
       LEFT JOIN tbl_Users u ON nc.UserID = u.UserID
       WHERE nc.CompID=@id`,
      { id }
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Complaint not found' });
    const c = rows[0];

    const history = await query(
      `SELECT cs.*, sm.StatusName, u.NameOfTheUser AS ByUserName
       FROM tbl_ComplaintStatus cs
       LEFT JOIN tbl_StatusMaster sm ON cs.StatusID = sm.StatusID
       LEFT JOIN tbl_Users u ON cs.UserID = u.UserID
       WHERE cs.CompaintID=@id ORDER BY cs.CompStatusID`,
      { id }
    );
    const answerable = await query('SELECT * FROM tbl_AnswerableMember WHERE CompID=@id', { id });
    const docCount = await query('SELECT COUNT(*) AS n FROM tbl_ComplaintDocument WHERE CompID=@id', { id });

    const sheet = buildScrutinyDefaults(c, history, answerable, {
      documentCount: docCount[0] ? docCount[0].n : 0,
    });

    if (c.ScrutinySheet) {
      try {
        const saved = JSON.parse(c.ScrutinySheet) || {};
        Object.keys(saved).forEach((k) => {
          if (saved[k] !== null && saved[k] !== undefined && String(saved[k]).trim() !== '') {
            sheet[k] = saved[k];
          }
        });
      } catch (e) {
        /* unreadable stored sheet - fall back to the defaults */
      }
    }
    if (c.CompNo) sheet.cno = c.CompNo;

    res.json(sheet);
  } catch (e) {
    console.error('scrutiny prefill error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/complaints/:id/scrutiny/pdf
 * Download the Scrutiny Sheet as a PDF carrying every value on the form.
 */
router.get('/:id/scrutiny/pdf', async (req, res) => {
  try {
    const access = await getComplaintAccess(req, req.params.id);
    if (!access.allowed) return res.status(403).json({ error: 'Not allowed' });
    if (!access.viewerIsInternal) return res.status(403).json({ error: 'Not allowed' });
    const out = await buildScrutinyPdf(req.params.id);
    if (!out || !out.data) return res.status(404).json({ error: 'Complaint not found' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${out.filename}`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(out.data));
  } catch (e) {
    console.error('scrutiny pdf error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/complaints/:id/form
 * Download the complaint form as a printable document.
 */
router.get('/:id/form', async (req, res) => {
  try {
    const access = await getComplaintAccess(req, req.params.id);
    if (!access.allowed) return res.status(403).json({ error: 'Not allowed' });
    if (!(access.viewerIsInternal || access.directComplainant)) return res.status(403).json({ error: 'Not allowed' });
    const html = await buildDownloadDoc(req.params.id, 'form', `${req.protocol}://${req.get('host')}`);
    if (!html) return res.status(404).json({ error: 'Complaint not found' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=ComplaintForm_${req.params.id}.html`);
    res.send(html);
  } catch (e) {
    console.error('download form error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/complaints/:id/compilation
 * Download the case compilation (form + full status history).
 */
router.get('/:id/compilation', async (req, res) => {
  try {
    const access = await getComplaintAccess(req, req.params.id);
    if (!access.allowed) return res.status(403).json({ error: 'Not allowed' });
    if (!access.viewerIsInternal) return res.status(403).json({ error: 'Not allowed' });
    const html = await buildDownloadDoc(req.params.id, 'compilation', `${req.protocol}://${req.get('host')}`);
    if (!html) return res.status(404).json({ error: 'Complaint not found' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=Compilation_${req.params.id}.html`);
    res.send(html);
  } catch (e) {
    console.error('download compilation error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/complaints/:id
 * Fetch a single complaint with all detail sections.
 */
/**
 * GET /api/complaints/search?q=&self=
 * Previous complaints used for Rule 5(4)(a)/(b)/(c). `self` excludes the
 * complaint that is being clubbed against itself.
 */
router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const self = Number(req.query.self || 0) || 0;
    if (q.length < 2) return res.json([]);
    const like = `%${q}%`;
    const params = { like, self };
    // Respondents / complainants never search the full case registry — that is a
    // staff (DD/SO/BOD/Officer/WO) capability. Scope outsiders to their own cases:
    let scope = '';
    const ut = Number(req.user.UserType);
    if (ut === 3) {
      scope = ' AND nc.UserID=@ownUserId';
      params.ownUserId = Number(req.user.UserID);
    } else if (ut === 2) {
      const respEmail = String(req.user.Email || '').trim().toLowerCase();
      if (!respEmail) return res.json([]);
      scope = ` AND nc.CompID IN (
          SELECT CompID FROM tbl_AnswerableMember WHERE LOWER(LTRIM(RTRIM(MemEmailID)))=@respEmail
          UNION
          SELECT CompID FROM tbl_NewComplaint WHERE LOWER(LTRIM(RTRIM(ResEmailID)))=@respEmail AND (IsTemp IS NULL OR IsTemp=0))`;
      params.respEmail = respEmail;
    }
    const rows = await query(
      `SELECT TOP 20 nc.CompID, nc.CompNo, nc.Name AS ComplainantName, nc.ResName, nc.ResRegistrationNo,
              nc.CompMembershipNo, nc.StatusID, sm.StatusName, nc.EntryDate, nc.UserID
       FROM tbl_NewComplaint nc
       LEFT JOIN tbl_StatusMaster sm ON nc.StatusID = sm.StatusID
       WHERE (nc.IsTemp IS NULL OR nc.IsTemp = 0)
         AND nc.CompID <> @self
         AND (nc.CompNo LIKE @like OR nc.Name LIKE @like OR nc.ResName LIKE @like
              OR nc.ResRegistrationNo LIKE @like OR nc.CompMembershipNo LIKE @like)
         ${scope}
       ORDER BY nc.EntryDate DESC`,
      params
    );
    res.json(rows);
  } catch (e) {
    console.error('search complaints error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/complaints/lookup?compNo=PR/001/2026
 * Exact complaint-number lookup used by the complainant end "Withdrawal of
 * Complaint" screen. The complainant may only pull up his own complaint.
 */
router.get('/lookup', async (req, res) => {
  try {
    const compNo = String(req.query.compNo || '').trim();
    if (!compNo) return res.status(400).json({ error: 'Enter the complaint number' });
    const params = { compNo };
    let scope = '';
    const ut = Number(req.user.UserType);
    if (ut === 3) {
      scope = ' AND nc.UserID=@ownUserId';
      params.ownUserId = Number(req.user.UserID);
    } else if (![1, 4, 5].includes(ut)) {
      return res.status(403).json({ error: 'You are not allowed to look up this complaint' });
    }
    const rows = await query(
      `SELECT TOP 1 nc.CompID, nc.CompNo, nc.Name AS ComplainantName, nc.ResName, nc.ResEmailID,
              nc.ResRegistrationNo, nc.CompType, ct.CompTypeName, nc.StatusID, sm.StatusName,
              nc.EntryDate, nc.ClubbedWithCompID, nc.ClubRule, nc.UserID,
              pc.CompNo AS ClubbedWithCompNo, pcs.StatusName AS ClubbedWithStatusName
       FROM tbl_NewComplaint nc
       LEFT JOIN tbl_StatusMaster sm ON nc.StatusID = sm.StatusID
       LEFT JOIN tbl_CompType ct ON nc.CompType = ct.CompTypeID
       LEFT JOIN tbl_NewComplaint pc ON nc.ClubbedWithCompID = pc.CompID
       LEFT JOIN tbl_StatusMaster pcs ON pc.StatusID = pcs.StatusID
       WHERE (nc.IsTemp IS NULL OR nc.IsTemp=0) AND nc.CompNo = @compNo ${scope}`,
      params
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'No complaint found against the complaint number entered' });
    }
    const row = rows[0];
    const isClubbedOrClosed =
      !!row.ClubbedWithCompID || CLUBBED_OR_CLOSED_STATUSES.includes(Number(row.StatusID));
    // Mirrors canWithdraw() in frontend/src/utils/rule54.js - Rule 6 is not
    // offered at the initial filing stages and not once the case is closed or
    // already inside the withdrawal flow.
    const INITIAL_WITHDRAWAL_STATUSES = [1, 2, 3, 4];
    const CLOSED_STATUSES = [9, 12, 13, 14, 21, 33, 43, 130];
    const WITHDRAWAL_FLOW_STATUSES = [127, 128, 129];
    const sid = Number(row.StatusID);
    // From "Rejoinder sought from the Complainant" (status 22) onwards the case
    // has advanced too far for a fresh letter of withdrawal. Status 124
    // (recommendation to the Working Officer) is an early scrutiny status.
    const isLateWithdrawalStage = sid >= 22 && sid !== 124;
    const canWithdraw =
      !isClubbedOrClosed &&
      !INITIAL_WITHDRAWAL_STATUSES.includes(sid) &&
      !CLOSED_STATUSES.includes(sid) &&
      !WITHDRAWAL_FLOW_STATUSES.includes(sid) &&
      !isLateWithdrawalStage;
    res.json({
      ...row,
      isClubbedOrClosed,
      canWithdraw,
    });
  } catch (e) {
    console.error('lookup complaint error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const complaint = await query(
      `SELECT nc.*,
              sm.StatusName, ct.CompTypeName,
              u.NameOfTheUser AS ComplainantName, u.Email AS ComplainantEmail, u.Mob AS ComplainantMobile,
              smSub.SubStatus,
              pc.CompNo AS ClubbedWithCompNo, pc.Name AS ClubbedWithComplainant,
              pu.Email AS ClubbedWithComplainantEmail, pc.ResName AS ClubbedWithResName,
              pc.StatusID AS ClubbedWithStatusID, pcs.StatusName AS ClubbedWithStatusName
       FROM tbl_NewComplaint nc
       LEFT JOIN tbl_StatusMaster sm ON nc.StatusID = sm.StatusID
       LEFT JOIN tbl_StatusMaster smSub ON nc.StatusID = smSub.StatusID
       LEFT JOIN tbl_CompType ct ON nc.CompType = ct.CompTypeID
       LEFT JOIN tbl_Users u ON nc.UserID = u.UserID
       LEFT JOIN tbl_NewComplaint pc ON nc.ClubbedWithCompID = pc.CompID
       LEFT JOIN tbl_Users pu ON pc.UserID = pu.UserID
       LEFT JOIN tbl_StatusMaster pcs ON pc.StatusID = pcs.StatusID
       WHERE nc.CompID=@id`,
      { id }
    );
    if (complaint.length === 0) return res.status(404).json({ error: 'Complaint not found' });

    const documents = await query('SELECT * FROM tbl_ComplaintDocument WHERE CompID=@id', { id });
    const factPersons = await query('SELECT * FROM tbl_FactPersons WHERE CompID=@id', { id });
    const answerable = await query('SELECT * FROM tbl_AnswerableMember WHERE CompID=@id', { id });
    const audioVideo = await query('SELECT * FROM tbl_AudioVideoAttachment WHERE ComplaintID=@id', { id });
    const schedules = await query('SELECT * FROM tbl_ScheduleList WHERE CompID=@id', { id });
    const statusHistory = await query(
      `SELECT cs.*, sm.StatusName, u.NameOfTheUser AS ByUserName, u.UserType AS ByUserType,
              u.Email AS ByUserEmail
       FROM tbl_ComplaintStatus cs
       INNER JOIN tbl_StatusMaster sm ON cs.StatusID = sm.StatusID
       LEFT JOIN tbl_Users u ON cs.UserID = u.UserID
       WHERE cs.CompaintID=@id ORDER BY cs.StatusDate DESC`,
      { id }
    );
    // Latest approved PER date (status 25) used for "5 days since PER" displays
    const perDetails = await query(
      `SELECT TOP 1 PERSignDate, CommonField AS PERPlace, StatusDate
       FROM tbl_ComplaintStatus
       WHERE CompaintID=@id AND StatusID=25 AND PERSignDate IS NOT NULL
       ORDER BY CompStatusID DESC`,
      { id }
    );
    const subStatus = await query(
      `SELECT cs.*, sm.StatusName,
              u.NameOfTheUser AS ByUserName, u.Email AS ByUserEmail
       FROM tbl_ComplaintSubStatus cs
       LEFT JOIN tbl_StatusMaster sm ON cs.StatusID = sm.StatusID
       LEFT JOIN tbl_Users u ON u.UserID = cs.UserID
       WHERE cs.CompID=@id ORDER BY cs.CSubStatusID DESC`,
      { id }
    );
    const similarCases = await query(
      `SELECT CASE WHEN sc.CompID=@id THEN sc.SCompID ELSE sc.CompID END AS SimilarCompID,
              nc.CompNo, nc.ResName, nc.StatusID, sm.StatusName, nc.EntryDate,
              CAST(DATEDIFF(day, nc.EntryDate, GETDATE()) AS int) AS DaysSinceEntry
       FROM tbl_SimilarCase sc
       INNER JOIN tbl_NewComplaint nc
         ON nc.CompID = CASE WHEN sc.CompID=@id THEN sc.SCompID ELSE sc.CompID END
       LEFT JOIN tbl_StatusMaster sm ON nc.StatusID = sm.StatusID
       WHERE (sc.CompID=@id OR sc.SCompID=@id) AND sc.SCompID IN (SELECT CompID FROM tbl_NewComplaint)`,
      { id }
    );

    // Who is looking at this complaint?
    //   - internal staff (Admin / DD / SO / Officer / RO / Committee ...) work on
    //     the case together and see every document attached by any of them.
    //   - the parties (complainant, respondent, third party / answerable member)
    //     only ever see the letters communicated to them and their own entries.
    let viewerRole = resolvePartyRole(req.user, complaint[0], answerable);
    const directComplainant = viewerRole === 'complainant';
    const viewerIsInternal = isInternalUser(req.user) && !viewerRole;
    if (!viewerIsInternal && !viewerRole) {
      // The first complainant of the complaint this one is clubbed with, and the
      // complainant of a complaint clubbed against this one, are parties too.
      const clubbedParty = isClubbedComplainant(req.user, complaint[0]) ||
        (await query(
          'SELECT TOP 1 CompID FROM tbl_NewComplaint WHERE ClubbedWithCompID=@id AND UserID=@uid',
          { id, uid: Number(req.user.UserID) }
        )).length > 0;
      if (!clubbedParty) {
        return res.status(403).json({ error: 'You are not a party to this complaint' });
      }
      // Treat clubbed complainants as complainant for document access.
      viewerRole = 'complainant';
    }
    const visibleStatusHistory = viewerIsInternal
      ? statusHistory
      : filterHistoryForParty(statusHistory, req.user, viewerRole);

    // The additional document requested on this case and who is still to furnish
    // it. A party does not get the list of the members who are yet to submit.
    const adState = buildAdRequestState(statusHistory, answerable);
    if (adState) {
      adState.ViewerSubmitted = viewerHasSubmitted(
        statusHistory,
        viewerRole,
        req.user,
        adState.RequestCompStatusID
      );
      // In a firm complaint the answerable members act as the respondent, so a
      // member may furnish a document called for from the respondent too.
      adState.ViewerCanSubmit = !viewerIsInternal && !!viewerRole && (
        adState.RequestedFrom.includes(viewerRole) ||
        (viewerRole === 'thirdparty' &&
          Number(complaint[0].IsFirm) === 1 &&
          adState.RequestedFrom.includes('respondent'))
      );
      if (!viewerIsInternal) {
        adState.PendingEmails = [];
      }
    }

    const isComplainantViewer = viewerIsInternal || directComplainant;
    const complaintPayload = { ...complaint[0] };
    if (!isComplainantViewer) {
      delete complaintPayload.BriefAttachment;
      delete complaintPayload.MisconductAttachment;
      delete complaintPayload.RegulatorAttachment;
      delete complaintPayload.AadharPhoto;
      delete complaintPayload.ComplaintantPhoto;
      delete complaintPayload.ComplaintantSignature;
      delete complaintPayload.ScrutinySheet;
      delete complaintPayload.AadharNo;
    }

    res.json({
      ...complaintPayload,
      // Documents uploaded with the complaint belong to the complainant. They
      // are shown to the internal staff and to the complainant only, never to
      // the respondent or the third party.
      documents: isComplainantViewer ? documents : [],
      factPersons,
      answerable,
      audioVideo: isComplainantViewer ? audioVideo : [],
      schedules,
      statusHistory: visibleStatusHistory,
      // Documents attached by the internal users - internal staff only.
      internalDocuments: viewerIsInternal ? buildInternalDocuments(statusHistory) : [],
      // Whether the logged in user is a party of this complaint and, if so, which.
      viewerRole,
      viewerIsInternal,
      additionalDocumentRequest: adState,
      perDetails: perDetails.length ? perDetails[0] : null,
      subStatus,
      similarCases,
    });
  } catch (e) {
    console.error('get complaint error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/complaints/:id/similar-candidates
 * Candidate "similar" complaints: same respondent registration no OR same nature
 * of allegation (mirrors the legacy SimilarCasesList.aspx). Returns the matching
 * complaints plus whether each is already linked in tbl_SimilarCase.
 */
router.get('/:id/similar-candidates', async (req, res) => {
  try {
    const id = req.params.id;
    const src = await query(
      'SELECT ResRegistrationNo, NatureOfAllegation, EntryDate FROM tbl_NewComplaint WHERE CompID=@id',
      { id }
    );
    if (src.length === 0) return res.status(404).json({ error: 'Complaint not found' });
    const regNo = String(src[0].ResRegistrationNo || '').trim();
    const nature = String(src[0].NatureOfAllegation || '').trim();
    const entryDate = src[0].EntryDate;
    if (!regNo && !nature) return res.json([]);
    if (!entryDate) return res.json([]);

    const rows = await query(
      `SELECT nc.CompID, nc.CompNo, nc.ResName, nc.EntryDate, nc.StatusID, sm.StatusName,
              nc.IsStay, nc.ClubbedWithCompID,
              CAST(DATEDIFF(day, nc.EntryDate, GETDATE()) AS int) AS DaysSinceEntry,
              CASE WHEN sc.CompID IS NOT NULL THEN 1 ELSE 0 END AS IsLinked
       FROM tbl_NewComplaint nc
       LEFT JOIN tbl_StatusMaster sm ON nc.StatusID = sm.StatusID
       LEFT JOIN tbl_SimilarCase sc ON sc.CompID=@id AND sc.SCompID=nc.CompID
       WHERE (nc.IsTemp IS NULL OR nc.IsTemp=0)
         AND nc.CompID <> @id
         AND (nc.EntryDate < @entryDate OR (nc.EntryDate = @entryDate AND nc.CompID < @id))
         AND nc.ClubbedWithCompID IS NULL
         AND nc.StatusID NOT IN (13,14,66,68,69,123,130)
         AND (
           (@regNo <> '' AND nc.ResRegistrationNo = @regNo)
           OR (@nature <> '' AND nc.NatureOfAllegation = @nature)
         )
       ORDER BY nc.EntryDate ASC`,
      { id, regNo, nature, entryDate }
    );
    res.json(rows);
  } catch (e) {
    console.error('similar candidates error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /api/complaints/:id/similar
 * Replace the set of linked similar complaints (tbl_SimilarCase) and, when a
 * primary "previous" complaint is given, move this complaint directly to the
 * same stage as that complaint (the Status 4 "Mark as Similar" option).
 * Body: { compIds: number[], primaryCompId?: number }
 * Note: GET /:id/status decodes `/:id` too, so this route must stay registered
 * without affecting it - it only matches the exact `/:id/similar` path.
 */
router.put('/:id/similar', async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user.UserID;
    const { compIds, primaryCompId } = req.body;
    const list = Array.isArray(compIds) ? compIds.map(Number).filter(Boolean) : [];
    const primary = primaryCompId ? Number(primaryCompId) : list[0] || null;
    if (list.length === 0) {
      return res.status(400).json({ error: 'Please select at least one similar complaint' });
    }
    const exists = await query('SELECT COUNT(*) AS cnt FROM tbl_NewComplaint WHERE CompID=@id', { id });
    if (Number(exists[0].cnt) === 0) return res.status(404).json({ error: 'Complaint not found' });
    if (list.includes(id)) {
      return res.status(400).json({ error: 'A complaint cannot be marked similar to itself' });
    }
    const selfRow = await query('SELECT ClubbedWithCompID, StatusID FROM tbl_NewComplaint WHERE CompID=@id', { id });
    if (selfRow.length && (selfRow[0].ClubbedWithCompID || [13,14,66,68,69,123,130].includes(Number(selfRow[0].StatusID)))) {
      return res.status(400).json({ error: 'This complaint cannot be marked similar as it is already clubbed/closed' });
    }

    const placeholders = list.map((_, i) => `@c${i}`).join(',');
    const targetParams = {};
    list.forEach((c, i) => { targetParams[`c${i}`] = c; });
    const found = await query(
      `SELECT COUNT(*) AS cnt FROM tbl_NewComplaint WHERE CompID IN (${placeholders}) AND ClubbedWithCompID IS NULL AND StatusID NOT IN (13,14,66,68,69,123,130)`,
      targetParams
    );
    if (Number(found[0].cnt) !== list.length) {
      return res.status(400).json({ error: 'One of the selected similar complaints could not be found or is already clubbed/closed' });
    }

    await executeNonQuery('DELETE FROM tbl_SimilarCase WHERE CompID=@id', { id });
    for (const sid of list) {
      await executeNonQuery(
        `INSERT INTO tbl_SimilarCase (CompID, SCompID, UserID, EntryDate)
         VALUES (@id, @sid, @userId, GETDATE())`,
        { id, sid, userId }
      );
    }

    // Move this complaint directly to the same stage as the primary previous
    // complaint (mirrors the status-insert logic of POST /:id/status).
    if (primary && list.includes(primary)) {
      const primaryRow = await query(
        'SELECT CompNo, StatusID FROM tbl_NewComplaint WHERE CompID=@p',
        { p: primary }
      );
      if (primaryRow.length && primaryRow[0].StatusID) {
        const prevStatus = Number(primaryRow[0].StatusID);
        const prevAssignee = await query(
          `SELECT TOP 1 UserToID FROM tbl_ComplaintStatus
           WHERE CompaintID=@p AND UserToID IS NOT NULL ORDER BY CompStatusID DESC`,
          { p: primary }
        );
        const userToId = prevAssignee.length ? Number(prevAssignee[0].UserToID) : null;
        const remarks = `Marked as similar to ${primaryRow[0].CompNo}; moved to the same stage (status ${prevStatus}).`;

        const latestRow = await query(
          'SELECT TOP 1 CompStatusID, StatusID FROM tbl_ComplaintStatus WHERE CompaintID=@id ORDER BY CompStatusID DESC',
          { id }
        );
        const alreadyParked = latestRow.length && Number(latestRow[0].StatusID) === prevStatus;
        if (alreadyParked) {
          await executeNonQuery(
            'UPDATE tbl_ComplaintStatus SET UserToID=@userToId, Remarks=@remarks WHERE CompStatusID=@csid',
            { userToId, remarks, csid: Number(latestRow[0].CompStatusID) }
          );
        } else {
          await executeNonQuery('UPDATE tbl_NewComplaint SET StatusID=@s WHERE CompID=@id', { s: prevStatus, id });
          await executeNonQuery(
            `INSERT INTO tbl_ComplaintStatus
               (CompaintID, StatusID, UserID, UserToID, StatusDate, Remarks)
             VALUES (@id, @s, @userId, @userToId, GETDATE(), @remarks)`,
            { id, s: prevStatus, userId, userToId, remarks }
          );
        }
      }
    }

    res.json({ message: 'Similar complaints updated', syncedTo: primary || null });
  } catch (e) {
    console.error('update similar error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/complaints/:id/answerable
 * Add an answerable member to a firm complaint. Mirrors AnswerableMembers.aspx
 * (btnMemAdd_Click): inserts into tbl_AnswerableMember and, when the member has
 * no account yet, creates a UserType-2 login so they can respond to the query.
 * Body: { memName, memRegistrationNo, memCountryCode, memMobileNo, memSTDCode,
 *         memLandlineNo, memProAddress, memCommAddress, memProState, memProCity,
 *         memCommStateId, memCommCityId, memProRegion, memCommRegion, memEmailID }
 */
router.post('/:id/answerable', async (req, res) => {
  try {
    const compId = req.params.id;
    const b = req.body;
    const userId = req.user.UserID;

    const firmRow = await query('SELECT IsFirm, FirmNo FROM tbl_NewComplaint WHERE CompID=@id', { id: compId });
    if (firmRow.length === 0) return res.status(404).json({ error: 'Complaint not found' });
    if (Number(firmRow[0].IsFirm) !== 1) {
      return res.status(400).json({ error: 'Answerable members can only be added for firm complaints' });
    }

    const memName = (b.memName || '').trim();
    const memRegNo = (b.memRegistrationNo || '').trim();
    const memEmail = (b.memEmailID || '').trim();
    if (!memName) return res.status(400).json({ error: 'Please enter Member Name' });
    if (!memRegNo) return res.status(400).json({ error: 'Please enter Member Registration No' });
    if (!/^\d+$/.test(memRegNo)) return res.status(400).json({ error: 'Please enter a valid Answerable Membership No' });
    if (!memEmail) return res.status(400).json({ error: 'Please enter Email ID' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memEmail)) {
      return res.status(400).json({ error: 'Please enter a valid Email ID' });
    }
    if (b.memCommStateId == null) return res.status(400).json({ error: 'Please Select Communication State' });
    if (b.memCommCityId == null) return res.status(400).json({ error: 'Please Select Communication City' });

    const dup = await query(
      'SELECT COUNT(*) AS cnt FROM tbl_AnswerableMember WHERE CompID=@id AND MemRegistrationNo=@regNo',
      { id: compId, regNo: memRegNo }
    );
    if (Number(dup[0].cnt) > 0) return res.status(409).json({ error: 'Already added Answerable member' });

    const result = await query(
      `INSERT INTO tbl_AnswerableMember
         (MemName, MemRegistrationNo, MemCountryCode, MemMobileNo, MemSTDCode, MemLandlineNo,
          MemProAddress, MemCommAddress, MemStateName, MemCityName, MemCommStateID, MemCommCityID,
          MemProRegion, MemCommRegion, MemEmailID, UserID, CompID, IsSenior, FirmNo)
       OUTPUT INSERTED.AMemID
       VALUES
         (@memName, @memRegNo, @memCountryCode, @memMobile, @memStd, @memLandline,
          @memProAddr, @memCommAddr, @memStateName, @memCityName, @memCommStateId, @memCommCityId,
          @memProRegion, @memCommRegion, @memEmail, @userId, @compId, 0, @firmNo)`,
      {
        memName,
        memRegNo,
        memCountryCode: b.memCountryCode || '91',
        memMobile: b.memMobileNo || null,
        memStd: b.memSTDCode || null,
        memLandline: b.memLandlineNo || null,
        memProAddr: b.memProAddress || null,
        memCommAddr: b.memCommAddress || null,
        memStateName: b.memProState || null,
        memCityName: b.memProCity || null,
        memCommStateId: Number(b.memCommStateId),
        memCommCityId: Number(b.memCommCityId),
        memProRegion: b.memProRegion || null,
        memCommRegion: b.memCommRegion || null,
        memEmail: memEmail || null,
        userId,
        compId: Number(compId),
        firmNo: firmRow[0].FirmNo || null,
      }
    );
    const amemId = result[0]?.AMemID;

    // Answerable members act as the respondents of a firm complaint, so give
    // each of them a UserType-2 login account immediately.
    await ensureAnswerableUserFromMember({
      MemName: memName,
      MemRegistrationNo: memRegNo,
      MemMobileNo: b.memMobileNo,
      MemEmailID: memEmail,
      MemCityName: b.memProCity,
    });

    const created = await query('SELECT * FROM tbl_AnswerableMember WHERE AMemID=@id', { id: amemId });
    res.json(created[0] || { AMemID: amemId });
  } catch (e) {
    console.error('add answerable error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /api/complaints/:id/answerable/:amemId
 * Remove an answerable member. Mirrors AnswerableMembers.aspx btnMemberDelete_Click.
 */
router.delete('/:id/answerable/:amemId', async (req, res) => {
  try {
    await executeNonQuery('DELETE FROM tbl_AnswerableMember WHERE AMemID=@amemId AND CompID=@compId', {
      amemId: Number(req.params.amemId),
      compId: Number(req.params.id),
    });
    res.json({ message: 'Answerable member removed' });
  } catch (e) {
    console.error('delete answerable error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /api/complaints/:id/answerable/:amemId/senior
 * Mark an answerable member as the signatory (IsSenior). Only one member can be
 * the signatory for a complaint. Mirrors AnswerableMembers.aspx chkSelect_CheckedChanged.
 * Body: { senior: 1 | 0 }
 */
router.put('/:id/answerable/:amemId/senior', async (req, res) => {
  try {
    const compId = Number(req.params.id);
    const amemId = Number(req.params.amemId);
    const senior = Number(req.body.senior) === 1 ? 1 : 0;

    if (senior === 1) {
      await executeNonQuery('UPDATE tbl_AnswerableMember SET IsSenior=0 WHERE CompID=@compId', { compId });
    }
    await executeNonQuery('UPDATE tbl_AnswerableMember SET IsSenior=@s WHERE AMemID=@amemId AND CompID=@compId', {
      s: senior,
      amemId,
      compId,
    });
    res.json({ message: senior ? 'Marked as signatory' : 'Signatory removed' });
  } catch (e) {
    console.error('set senior error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/complaints/:id/respondent-response
 * Respondent's reply to the "Written Statement sought" query (Status 15).
 * Mirrors ViewDetailedComplaint.aspx:
 *   - kind 'written'  -> Status 16 (Written Statement Submitted), routed back to
 *                        the SO. For firm complaints the reply is recorded per
 *                        answerable member (tbl_ComplaintSubStatus) and the case
 *                        advances to Status 16 only after every answerable member
 *                        has filed (btnSubmitStatement_Click semantics).
 *   - kind 'rule12'   -> Status 63 (Rule-12 Application submitted), routed to SO
 *                        (btnRule12_Click).
 * Body: { kind, remarks, attachment }
 */
router.post('/:id/respondent-response', async (req, res) => {
  try {
    const compId = req.params.id;
    const { kind, remarks, attachment } = req.body;
    const userId = req.user.UserID;

    const access = await getComplaintAccess(req, compId);
    if (!access.allowed) return res.status(403).json({ error: access.reason || 'Not allowed' });
    if (access.viewerIsInternal || !['respondent', 'thirdparty'].includes(access.viewerRole)) {
      return res.status(403).json({ error: 'Only the respondent can submit this response' });
    }

    if (kind !== 'written' && kind !== 'rule12') {
      return res.status(400).json({ error: 'Invalid response type' });
    }
    if (!remarks || !String(remarks).trim()) {
      return res.status(400).json({ error: 'Please enter remarks' });
    }
    if (!attachment) {
      return res.status(400).json({ error: 'Please upload the document' });
    }

    // The respondent gets a UserType-2 login when they file their reply, so they
    // (or their firm's answerable members) can keep accessing the case later.
    await ensureRespondentUserForComplaint(compId);

    const compRow = await query('SELECT IsFirm, StatusID FROM tbl_NewComplaint WHERE CompID=@id', { id: compId });
    if (compRow.length === 0) return res.status(404).json({ error: 'Complaint not found' });
    if (Number(compRow[0].StatusID) !== 15) {
      return res.status(409).json({ error: 'The written statement / Rule 12 application can be submitted only when it is sought' });
    }
    const isFirm = Number(compRow[0].IsFirm) === 1;

    const target = kind === 'written' ? 16 : 63;

    // Mirror UpdateStatus() guard: never re-insert when the complaint is already parked
    // at the target status.
    const maxRow = await query(
      'SELECT TOP 1 StatusID FROM tbl_ComplaintStatus WHERE CompaintID=@id ORDER BY CompStatusID DESC',
      { id: compId }
    );
    if (maxRow.length && Number(maxRow[0].StatusID) === target) {
      return res.status(409).json({ error: 'Already submitted' });
    }

    const userToId = await resolveSOFromStatement(compId);

    // Firm complaint with answerable members: each answerable member acts as the
    // respondent and files their own statement. The case advances to Status 16
    // only after every answerable member has submitted.
    if (kind === 'written' && isFirm) {
      // Count the distinct member emails: each email is one login and therefore
      // one written statement (duplicate rows for the same member must not keep
      // the case pending forever). Members saved without an email are legacy
      // rows and cannot log in, so they are not waited on.
      const answerable = await query(
        `SELECT COUNT(DISTINCT LOWER(LTRIM(RTRIM(MemEmailID)))) AS cnt
         FROM tbl_AnswerableMember
         WHERE CompID=@id AND MemEmailID IS NOT NULL AND LTRIM(RTRIM(MemEmailID))<>''`,
        { id: compId }
      );
      const total = Number(answerable[0].cnt);
      if (total > 0) {
        const reviewerEmail = String(req.user.Email || '').trim().toLowerCase();
        const memberRow = await query(
          `SELECT TOP 1 AMemID FROM tbl_AnswerableMember
           WHERE CompID=@id AND LOWER(LTRIM(RTRIM(MemEmailID)))=@email`,
          { id: compId, email: reviewerEmail }
        );
        if (!memberRow.length) {
          return res.status(403).json({
            error: 'Only the answerable members of the firm can submit the written statement.',
          });
        }

        const already = await query(
          'SELECT COUNT(*) AS cnt FROM tbl_ComplaintSubStatus WHERE CompID=@id AND StatusID=16 AND UserID=@userId',
          { id: compId, userId }
        );
        if (Number(already[0].cnt) > 0) return res.status(409).json({ error: 'Already submitted' });

        await executeNonQuery(
          `INSERT INTO tbl_ComplaintSubStatus (StatusID, UserID, Remarks, CompID, Attachment, Decision, Decisiondate)
           VALUES (16, @userId, @remarks, @compId, @attachment, 'Written Statement', GETDATE())`,
          { userId, remarks: String(remarks).trim(), compId: Number(compId), attachment }
        );

        // Count only the statements filed by the current answerable members, so
        // an older submission by the firm's respondent cannot complete the list.
        const doneRow = await query(
          `SELECT COUNT(DISTINCT cs.UserID) AS cnt
           FROM tbl_ComplaintSubStatus cs
           INNER JOIN tbl_Users u ON u.UserID = cs.UserID
           WHERE cs.CompID=@id AND cs.StatusID=16
             AND LOWER(LTRIM(RTRIM(u.Email))) IN (
               SELECT LOWER(LTRIM(RTRIM(MemEmailID)))
               FROM tbl_AnswerableMember
               WHERE CompID=@id AND MemEmailID IS NOT NULL AND LTRIM(RTRIM(MemEmailID))<>''
             )`,
          { id: compId }
        );
        if (Number(doneRow[0].cnt) < total) {
          return res.json({
            message: 'Written Statement recorded. Awaiting the remaining answerable members.',
            pending: true,
          });
        }
      }
    }

    await executeNonQuery('UPDATE tbl_NewComplaint SET StatusID=@s WHERE CompID=@id', { s: target, id: compId });
    await executeNonQuery(
      `INSERT INTO tbl_ComplaintStatus (CompaintID, StatusID, UserID, UserToID, StatusDate, Remarks, Attachment)
       VALUES (@id, @s, @userId, @userToId, GETDATE(), @remarks, @attachment)`,
      {
        id: compId,
        s: target,
        userId,
        userToId: userToId || null,
        remarks: String(remarks).trim(),
        attachment,
      }
    );

    res.json({
      message: kind === 'written' ? 'Submitted Written Statement' : 'Application under rule 12 have been submitted',
    });
  } catch (e) {
    console.error('respondent response error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/complaints/:id/complainant-rejoinder
 * Complainant's rejoinder to the Written Statement forwarded by the SO
 * (Status 22 → Status 23). Mirrors the ASPX rejoinder flow (btnRejoinder_Click):
 *   1. Only the complainant who filed the complaint may submit.
 *   2. The case must currently be parked at Status 22 (Rejoinder sought).
 *   3. On submission the case advances to Status 23 (Rejoinder submitted) and
 *      routes back to the same SO who called for the rejoinder (status 22's
 *      UserID), so the SO drives the PER flow next.
 * Body: { remarks, attachment }
 */
router.post('/:id/complainant-rejoinder', async (req, res) => {
  try {
    const compId = req.params.id;
    const { remarks, attachment } = req.body;
    const userId = Number(req.user.UserID);

    if (!remarks || !String(remarks).trim()) {
      return res.status(400).json({ error: 'Please enter remarks' });
    }
    if (!attachment) {
      return res.status(400).json({ error: 'Please upload the rejoinder document' });
    }

    const compRow = await query('SELECT StatusID, UserID FROM tbl_NewComplaint WHERE CompID=@id', { id: compId });
    if (compRow.length === 0) return res.status(404).json({ error: 'Complaint not found' });
    if (Number(compRow[0].UserID) !== userId) {
      return res.status(403).json({ error: 'Only the complainant can submit the rejoinder' });
    }
    if (Number(compRow[0].StatusID) !== 22) {
      return res.status(409).json({ error: 'Rejoinder can be submitted only after the SO calls for it' });
    }

    // Guard: never re-insert when the case is already parked at Status 23.
    const maxRow = await query(
      'SELECT TOP 1 StatusID FROM tbl_ComplaintStatus WHERE CompaintID=@id ORDER BY CompStatusID DESC',
      { id: compId }
    );
    if (maxRow.length && Number(maxRow[0].StatusID) === 23) {
      return res.status(409).json({ error: 'Rejoinder already submitted' });
    }

    // Route back to the SO who called for the rejoinder (Status 22's UserID).
    const soRow = await query(
      'SELECT TOP 1 UserID FROM tbl_ComplaintStatus WHERE CompaintID=@id AND StatusID=22 ORDER BY CompStatusID DESC',
      { id: compId }
    );
    const userToId = soRow.length ? soRow[0].UserID : null;

    await executeNonQuery('UPDATE tbl_NewComplaint SET StatusID=23 WHERE CompID=@id', { id: compId });
    await executeNonQuery(
      `INSERT INTO tbl_ComplaintStatus (CompaintID, StatusID, UserID, UserToID, StatusDate, Remarks, Attachment)
       VALUES (@id, 23, @userId, @userToId, GETDATE(), @remarks, @attachment)`,
      {
        id: compId,
        userId,
        userToId: userToId || null,
        remarks: String(remarks).trim(),
        attachment,
      }
    );

    res.json({ message: 'Rejoinder submitted. The case has been routed to the Scrutiny Officer for the next stage.' });
  } catch (e) {
    console.error('complainant rejoinder error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/complaints/:id/additional-document-request
 * The Scrutiny Officer calls for an additional document. The document may be
 * called for from the Complainant, the Respondent and/or the Third Party
 * (answerable members) - any combination of them. The request is recorded on a
 * status 51 row whose CommonField carries the parties it was made to
 * ("ADReq=complainant;respondent").
 * Body: { parties: ['complainant','respondent','thirdparty'], remarks, attachment }
 */
router.post('/:id/additional-document-request', async (req, res) => {
  try {
    const compId = req.params.id;
    const { parties, remarks, attachment } = req.body;
    const userId = Number(req.user.UserID);

    if (!isInternalUser(req.user)) {
      return res.status(403).json({ error: 'Only the internal staff can call for an additional document' });
    }

    const requested = (Array.isArray(parties) ? parties : String(parties || '').split(/[,;]/))
      .map((p) => String(p).trim().toLowerCase())
      .filter((p) => AD_PARTIES.includes(p));
    const requestedFrom = Array.from(new Set(requested));
    if (!requestedFrom.length) {
      return res.status(400).json({
        error: 'Select at least one party to call for the additional document from',
      });
    }
    if (!remarks || !String(remarks).trim()) {
      return res.status(400).json({ error: 'Please enter remarks' });
    }
    if (!attachment) {
      return res.status(400).json({ error: 'Please upload the query letter' });
    }

    const compRow = await query(
      'SELECT CompID, CompNo, StatusID, UserID, ResEmailID, IsFirm FROM tbl_NewComplaint WHERE CompID=@id',
      { id: compId }
    );
    if (compRow.length === 0) return res.status(404).json({ error: 'Complaint not found' });
    if (Number(compRow[0].StatusID) !== 56) {
      return res.status(409).json({
        error: 'The additional document can be called for only after the Director Discipline has approved it',
      });
    }

    // The respondent / the third party have to be on the complaint to be called
    // for the document. In a firm complaint the answerable members act as the
    // respondent, so the respondent option is available even when no single
    // ResEmailID is stored.
    const isFirm = Number(compRow[0].IsFirm) === 1;
    const members = await query('SELECT COUNT(*) AS cnt FROM tbl_AnswerableMember WHERE CompID=@id', { id: compId });
    const memberCount = Number(members[0].cnt);
    if (requestedFrom.includes('respondent') && !String(compRow[0].ResEmailID || '').trim()) {
      if (!isFirm || !memberCount) {
        return res.status(400).json({ error: 'There is no respondent on this complaint' });
      }
    }
    if (requestedFrom.includes('thirdparty') && !memberCount) {
      return res.status(400).json({
        error: 'There is no third party / answerable member on this complaint',
      });
    }

    await executeNonQuery('UPDATE tbl_NewComplaint SET StatusID=51 WHERE CompID=@id', { id: compId });
    await executeNonQuery(
      `INSERT INTO tbl_ComplaintStatus (CompaintID, StatusID, UserID, UserToID, StatusDate, Remarks, Attachment, CommonField)
       VALUES (@id, 51, @userId, NULL, GETDATE(), @remarks, @attachment, @commonField)`,
      {
        id: compId,
        userId,
        remarks: String(remarks).trim(),
        attachment,
        commonField: `ADReq=${requestedFrom.join(';')}`,
      }
    );

    res.json({
      message: 'Query for the additional document sent.',
      requestedFrom,
    });
  } catch (e) {
    console.error('additional-document-request error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/complaints/:id/additional-document
 * The reply to the SO's "Additional Document" query (Status 51). The document
 * may have been called for from the Complainant, the Respondent and/or the Third
 * Party (answerable members); each of them furnishes it here and the case moves
 * on only when every party it was called for from has submitted.
 * Body: { remarks, attachment }
 */
router.post('/:id/additional-document', async (req, res) => {
  try {
    const compId = req.params.id;
    const { remarks, attachment } = req.body;
    const userId = Number(req.user.UserID);

    if (!remarks || !String(remarks).trim()) {
      return res.status(400).json({ error: 'Please enter remarks' });
    }
    if (!attachment) {
      return res.status(400).json({ error: 'Please upload the additional document' });
    }

    const compRow = await query(
      'SELECT CompID, CompNo, StatusID, UserID, ResEmailID, IsFirm FROM tbl_NewComplaint WHERE CompID=@id',
      { id: compId }
    );
    if (compRow.length === 0) return res.status(404).json({ error: 'Complaint not found' });
    if (Number(compRow[0].StatusID) !== 51) {
      return res.status(409).json({ error: 'Additional document can be submitted only after the SO calls for it' });
    }

    // Which party of the complaint is submitting?
    const answerable = await query('SELECT * FROM tbl_AnswerableMember WHERE CompID=@id', { id: compId });
    const role = resolvePartyRole(req.user, compRow[0], answerable);
    if (!role) {
      return res.status(403).json({ error: 'Only a party to this complaint can submit the additional document' });
    }

    const history = await query(
      `SELECT cs.*, sm.StatusName, u.NameOfTheUser AS ByUserName, u.UserType AS ByUserType,
              u.Email AS ByUserEmail
       FROM tbl_ComplaintStatus cs
       INNER JOIN tbl_StatusMaster sm ON cs.StatusID = sm.StatusID
       LEFT JOIN tbl_Users u ON cs.UserID = u.UserID
       WHERE cs.CompaintID=@id ORDER BY cs.StatusDate DESC`,
      { id: compId }
    );
    const state = buildAdRequestState(history, answerable);
    const requestedFrom = state ? state.RequestedFrom : ['complainant'];
    // In a firm complaint the answerable members act as the respondent, so a
    // member may furnish a document called for from the respondent as well.
    const isFirm = Number(compRow[0].IsFirm) === 1;
    const memberActingAsRespondent =
      role === 'thirdparty' && isFirm && requestedFrom.includes('respondent');
    if (!requestedFrom.includes(role) && !memberActingAsRespondent) {
      return res.status(403).json({ error: 'The additional document has not been called for from you' });
    }
    const submitRoles = memberActingAsRespondent
      ? ['respondent', ...(requestedFrom.includes('thirdparty') ? ['thirdparty'] : [])]
      : [role];

    // Guard: never re-insert when the case is already parked at Status 59.
    const maxRow = await query(
      'SELECT TOP 1 StatusID FROM tbl_ComplaintStatus WHERE CompaintID=@id ORDER BY CompStatusID DESC',
      { id: compId }
    );
    if (maxRow.length && Number(maxRow[0].StatusID) === 59) {
      return res.status(409).json({ error: 'Additional document already submitted' });
    }

    // The same party must not furnish the document twice.
    if (viewerHasSubmitted(history, role, req.user, state ? state.RequestCompStatusID : 0)) {
      return res.status(409).json({ error: 'Additional document already submitted' });
    }

    // Route back to the SO who called for the additional document (status 51's UserID).
    const soRow = await query(
      'SELECT TOP 1 UserID FROM tbl_ComplaintStatus WHERE CompaintID=@id AND StatusID=51 ORDER BY CompStatusID DESC',
      { id: compId }
    );
    const userToId = soRow.length ? soRow[0].UserID : null;

    // The status the submission is recorded at depends on the party that has
    // furnished it.
    const submitStatusId = submitRoles.includes('respondent') ? 131 : role === 'complainant' ? 52 : 132;

    await executeNonQuery(
      `INSERT INTO tbl_ComplaintStatus (CompaintID, StatusID, UserID, UserToID, StatusDate, Remarks, Attachment, CommonField)
       VALUES (@id, @s, @userId, @userToId, GETDATE(), @remarks, @attachment, @commonField)`,
      {
        id: compId,
        s: submitStatusId,
        userId,
        userToId: userToId || null,
        remarks: String(remarks).trim(),
        attachment,
        commonField: `ADSub=${submitRoles.join(';')}`,
      }
    );

    // The case moves on only when every party the document was called for from
    // has furnished it.
    const afterHistory = await query(
      `SELECT cs.*, sm.StatusName, u.NameOfTheUser AS ByUserName, u.UserType AS ByUserType,
              u.Email AS ByUserEmail
       FROM tbl_ComplaintStatus cs
       INNER JOIN tbl_StatusMaster sm ON cs.StatusID = sm.StatusID
       LEFT JOIN tbl_Users u ON cs.UserID = u.UserID
       WHERE cs.CompaintID=@id ORDER BY cs.StatusDate DESC`,
      { id: compId }
    );
    const afterState = buildAdRequestState(afterHistory, answerable);
    const pending = afterState ? afterState.Pending : [];

    if (pending.length) {
      return res.json({
        message: 'Additional document submitted. The case awaits the document from the remaining party/parties.',
        pending: true,
        pendingFrom: pending,
      });
    }

    await executeNonQuery('UPDATE tbl_NewComplaint SET StatusID=59 WHERE CompID=@id', { id: compId });
    await executeNonQuery(
      `INSERT INTO tbl_ComplaintStatus (CompaintID, StatusID, UserID, UserToID, StatusDate, Remarks, Attachment)
       VALUES (@id, 59, @userId, @userToId, GETDATE(), @remarks, @attachment)`,
      {
        id: compId,
        userId,
        userToId: userToId || null,
        remarks: String(remarks).trim(),
        attachment,
      }
    );

    res.json({ message: 'Additional document submitted. The case has been routed to the Scrutiny Officer.' });
  } catch (e) {
    console.error('additional-document error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /api/complaints/:id
 * Update an existing (defect-returned) complaint. Mirrors the ASPX
 * FileNewComplaint.aspx resubmission flow: after the SO communicates defects
 * (StatusID 3), the complainant re-opens the same complaint form, edits every
 * detail, and resubmits. The main record + nested child tables are replaced
 * and the complaint moves back to Status 4 (Rectified Complaint submitted by
 * the Complainant) assigned to the same SO who flagged the defect.
 * Body: same full complaint payload as POST /api/complaints.
 */
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body;
    const userId = req.user.UserID;
    const userType = Number(req.user.UserType);

    const existing = await query('SELECT * FROM tbl_NewComplaint WHERE CompID=@id', { id });
    if (existing.length === 0) return res.status(404).json({ error: 'Complaint not found' });
    const cur = existing[0];
    const isDraft = b.isDraft === true || b.isDraft === 1 || b.isDraft === '1';
    const wasDraft = Number(cur.IsTemp) === 1;

    // Only the complainant who filed it (or a DD / admin) may edit. The complaint
    // must be a draft, awaiting rectification (Status 3) or already re-submitted
    // (Status 4).
    const isOwner = String(cur.UserID) === String(userId);
    const isAdmin = [1, 4].includes(userType);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You are not authorised to edit this complaint' });
    }
    if (!isAdmin && !wasDraft && ![3, 4].includes(Number(cur.StatusID))) {
      return res.status(400).json({ error: 'Only defect-returned complaints can be edited' });
    }

    // Resolve respondent region from state (matches POST behaviour)
    let resRegion = b.resRegion || null;
    if (b.resStateId && !resRegion) {
      try {
        const rr = await query('SELECT Region FROM tbl_StateMaster WHERE StateID=@sid', { sid: b.resStateId });
        if (rr.length) resRegion = rr[0].Region;
      } catch (_) {}
    }
    let complainantRegion = b.complainantRegion || cur.Region || null;
    if (b.stateId && !complainantRegion) {
      try {
        const regionRow = await query('SELECT Region FROM tbl_StateMaster WHERE StateID=@sid', { sid: b.stateId });
        if (regionRow.length) complainantRegion = regionRow[0].Region;
      } catch (_) {}
    }

    await executeNonQuery(
      `UPDATE tbl_NewComplaint SET
         CompType=@compType, Name=@name, EmailID=@email, CountryCode=@countryCode,
         MobileNo=@mobile, STDCode=@stdCode, LandlineNo=@landlineNo,
         Address=@address, Area=@area, Landmark=@landmark, AadharNo=@aadharNo,
         AadharPhoto=@aadharPhoto, ComplaintantPhoto=@photo, ComplaintantSignature=@signature,
         ResName=@resName, ResRegistrationNo=@resReg, ResCountryCode=@resCountry,
         ResMobileNo=@resMobile, ResSTDCode=@resStd, ResLandlineNo=@resLandline,
         ResProfAddress=@resProfAddr, ResCommAddress=@resCommAddr, ResEmailID=@resEmail,
         BriefStatement=@brief, BriefAttachment=@briefAttach,
         ParticularMisconduct=@misconduct, MisconductAttachment=@misconductAttach,
         PaymentMode=@paymentMode, PaymentDate=@paymentDate, TransRefNo=@transRef,
         GSTINNo=@gstIn, InstrumentNo=@instrumentNo, InstrumentDate=@instrumentDate,
         TaxableAmount=@taxable, TaxRate=@taxRate, PaymentDetails=@paymentDetails,
         StateID=@stateId, CityID=@cityId, PinCode=@pincode, Region=@region,
         RStateName=@rStateName, RCityName=@rCityName, RStateID=@rStateId, RCityID=@rCityId,
         RRegion=@rRegion, RComRegion=@rComRegion,
         Salutation=@salutation, RelationName=@relationName,
         RegulatorName=@regulatorName, RegulatorDesignation=@regulatorDesignation,
         RegulatorID=@regulatorId, RegulatorAttachment=@regulatorAttach, PersonName=@personName,
         IsFirm=@isFirm, NameofFirm=@nameOfFirm, FirmNo=@firmNo,
         FirmProfAddress=@firmProfAddr, FirmCommAddress=@firmCommAddr,
         FirmProfStateID=@firmProfStateId, FirmProfCityID=@firmProfCityId,
         FormType=@formType,
         InvestigatingReport=@investReport, IsInvestigatingReportAvailable=@isInvestReport,
         GSTType=@gstType, IsAnswerable=@isAnswerable, Declaration=@declaration, IsAudioVideo=@isAudioVideo,
         EntityMisconduct=@entityMisconduct, isChkSameAddress=@isChkSameAddress,
         NatureOfAllegation=@nature, NatureDatails=@natureDetails,
         EntryDate=GETDATE()
       WHERE CompID=@id`,
      {
        id,
        compType: b.compTypeId || cur.CompType || null,
        name: b.name || cur.Name || null,
        email: b.email || cur.EmailID || null,
        countryCode: b.countryCode || cur.CountryCode || '91',
        mobile: b.mobile || cur.MobileNo || null,
        stdCode: b.stdCode ?? cur.STDCode ?? null,
        landlineNo: b.landlineNo ?? cur.LandlineNo ?? null,
        address: b.address ?? cur.Address ?? null,
        area: b.area ?? cur.Area ?? null,
        landmark: b.landmark ?? cur.Landmark ?? null,
        aadharNo: b.aadharNo ?? cur.AadharNo ?? null,
        aadharPhoto: b.aadharPhoto ?? cur.AadharPhoto ?? null,
        photo: b.complaintantPhoto ?? cur.ComplaintantPhoto ?? null,
        signature: b.complaintantSignature ?? cur.ComplaintantSignature ?? null,
        resName: b.resName ?? cur.ResName ?? null,
        resReg: b.isFirm ? null : b.resRegistrationNo || cur.ResRegistrationNo || null,
        resCountry: b.resCountryCode || cur.ResCountryCode || '91',
        resMobile: b.resMobile ?? cur.ResMobileNo ?? null,
        resStd: b.resStdCode ?? cur.ResSTDCode ?? null,
        resLandline: b.resLandlineNo ?? cur.ResLandlineNo ?? null,
        resProfAddr: b.resProfessionalAddress ?? cur.ResProfAddress ?? null,
        resCommAddr: b.resCommunicationAddress ?? cur.ResCommAddress ?? null,
        resEmail: b.resEmail ?? cur.ResEmailID ?? null,
        brief: b.briefStatement ?? cur.BriefStatement ?? null,
        briefAttach: b.briefAttachment ?? cur.BriefAttachment ?? null,
        misconduct: b.particularMisconduct ?? cur.ParticularMisconduct ?? null,
        misconductAttach: b.misconductAttachment ?? cur.MisconductAttachment ?? null,
        paymentMode: b.paymentMode ?? cur.PaymentMode ?? null,
        paymentDate: b.paymentDate ?? cur.PaymentDate ?? null,
        transRef: b.transRefNo ?? cur.TransRefNo ?? null,
        gstIn: b.gstinNo ?? cur.GSTINNo ?? null,
        instrumentNo: b.instrumentNo ?? cur.InstrumentNo ?? null,
        instrumentDate: b.instrumentDate ?? cur.InstrumentDate ?? null,
        taxable: b.taxableAmount ?? cur.TaxableAmount ?? null,
        taxRate: b.taxRate ?? cur.TaxRate ?? null,
        paymentDetails: b.paymentDetails ?? cur.PaymentDetails ?? null,
        stateId: b.stateId ?? cur.StateID ?? null,
        cityId: b.cityId ?? cur.CityID ?? null,
        pincode: b.pincode ?? cur.Pincode ?? null,
        region: complainantRegion || cur.Region || null,
        rStateName: b.resRStateName ?? cur.RStateName ?? null,
        rCityName: b.resRCityName ?? cur.RCityname ?? null,
        rStateId: b.resStateId ?? cur.RStateID ?? null,
        rCityId: b.resCityId ?? cur.RCityID ?? null,
        rRegion: resRegion || cur.RRegion || null,
        rComRegion: b.resComRegion ?? cur.RComRegion ?? null,
        salutation: b.salutation ?? cur.Salutation ?? null,
        relationName: b.relationName ?? cur.RelationName ?? null,
        regulatorName: b.regulatorName ?? cur.RegulatorName ?? null,
        regulatorDesignation: b.regulatorDesignation ?? cur.RegulatorDesignation ?? null,
        regulatorId: b.regulatorId ?? cur.RegulatorID ?? null,
        regulatorAttach: b.regulatorAttachment ?? cur.RegulatorAttachment ?? null,
        personName: b.personName ?? cur.PersonName ?? null,
        isFirm: b.isFirm ? 1 : Number(cur.IsFirm) || 0,
        nameOfFirm: b.nameOfFirm ?? cur.NameofFirm ?? null,
        firmNo: b.firmNo ?? cur.FirmNo ?? null,
        firmProfAddr: b.firmProfAddress ?? cur.FirmProfAddress ?? null,
        firmCommAddr: b.firmCommAddress ?? cur.FirmCommAddress ?? null,
        firmProfStateId: b.firmProfStateId ?? cur.FirmProfStateID ?? null,
        firmProfCityId: b.firmProfCityId ?? cur.FirmProfCityID ?? null,
        formType: b.formType ?? cur.FormType ?? null,
        investReport: b.investigatingReport ?? cur.InvestigatingReport ?? null,
        isInvestReport: b.isInvestigatingReportAvailable
          ? Number(b.isInvestigatingReportAvailable)
          : Number(cur.IsInvestigatingReportAvailable) || 0,
        gstType: b.gstType ?? cur.GSTType ?? null,
        isAnswerable: b.isAnswerable ?? cur.IsAnswerable ?? 0,
        declaration: b.declaration ? 1 : Number(cur.Declaration) || 0,
        isAudioVideo: b.audioVideo && b.audioVideo.length ? '1' : b.isAudioVideo ?? cur.IsAudioVideo ?? 0,
        entityMisconduct: b.entityMisconduct ?? cur.EntityMisconduct ?? null,
        isChkSameAddress: b.isChkSameAddress ? 1 : Number(cur.isChkSameAddress) || 0,
        nature: b.natureOfAllegation ?? cur.NatureOfAllegation ?? null,
        natureDetails: b.natureDetails ?? b.natureOfAllegation ?? cur.NatureDatails ?? null,
      }
    );

    // ----- Replace nested child records (documents, facts, schedules, answerable, AV) -----
    await executeNonQuery('DELETE FROM tbl_ComplaintDocument WHERE CompID=@id', { id });
    await executeNonQuery('DELETE FROM tbl_FactPersons WHERE CompID=@id', { id });
    await executeNonQuery('DELETE FROM tbl_ScheduleList WHERE CompID=@id', { id });
    await executeNonQuery('DELETE FROM tbl_AnswerableMember WHERE CompID=@id', { id });
    await executeNonQuery('DELETE FROM tbl_AudioVideoAttachment WHERE ComplaintID=@id', { id });

    if (Array.isArray(b.documents)) {
      for (const doc of b.documents) {
        await executeNonQuery(
          `INSERT INTO tbl_ComplaintDocument (CompID, DocumentID, DocURL, EntryDate)
           VALUES (@compId, @docId, @docUrl, GETDATE())`,
          { compId: id, docId: doc.documentId || doc.name || null, docUrl: doc.docUrl || doc.path || null }
        );
      }
    }
    if (Array.isArray(b.factPersons)) {
      for (const p of b.factPersons) {
        await executeNonQuery(
          `INSERT INTO tbl_FactPersons (CompID, PersonName, PersonMobile, PersonEmail, UserID)
           VALUES (@compId, @name, @mobile, @email, @userId)`,
          { compId: id, name: p.personName || null, mobile: p.personMobile || null, email: p.personEmail || null, userId }
        );
      }
    }
    if (Array.isArray(b.schedules)) {
      for (const s of b.schedules) {
        await executeNonQuery(
          `INSERT INTO tbl_ScheduleList (CompID, Schedule, PartNo, ItemNo, MisconductDate, MisconductDateTo, MisconDate, UserID)
           VALUES (@compId, @schedule, @partNo, @itemNo, @misconDate, @misconDateTo, @misconDate, @userId)`,
          {
            compId: id,
            schedule: s.schedule ?? null,
            partNo: s.partNo ?? null,
            itemNo: s.itemNo ?? null,
            misconDate: s.misconductDate || s.misconductDateFrom || null,
            misconDateTo: s.misconductDateTo || null,
            userId,
          }
        );
      }
    }
    if (Array.isArray(b.answerableMembers)) {
      for (const m of b.answerableMembers) {
        await executeNonQuery(
          `INSERT INTO tbl_AnswerableMember
            (CompID, MemName, MemRegistrationNo, MemCountryCode, MemMobileNo, MemSTDCode, MemLandlineNo,
             MemProAddress, MemCommAddress, MemStateName, MemCityName, MemCommStateID, MemCommCityID,
             MemProRegion, MemCommRegion, MemEmailID, FirmNo, UserID)
           VALUES
            (@compId, @name, @regNo, @countryCode, @mobile, @stdCode, @landline,
             @proAddr, @commAddr, @stateName, @cityName, @commStateId, @commCityId,
             @proRegion, @commRegion, @email, @firmNo, @userId)`,
          {
            compId: id,
            name: m.memName ?? null,
            regNo: m.memRegistrationNo ?? null,
            countryCode: m.memCountryCode ?? null,
            mobile: m.memMobileNo ?? null,
            stdCode: m.memSTDCode ?? null,
            landline: m.memLandlineNo ?? null,
            proAddr: m.memProAddress ?? null,
            commAddr: m.memCommAddress ?? null,
            stateName: m.memProState ?? null,
            cityName: m.memProCity ?? null,
            commStateId: m.memCommStateId ?? null,
            commCityId: m.memCommCityId ?? null,
            proRegion: m.memProRegion ?? null,
            commRegion: m.memCommRegion ?? null,
            email: m.memEmailID ?? null,
            firmNo: m.firmNo ?? null,
            userId,
          }
        );
      }

      // Answerable members get their own login accounts (firm respondents).
      await ensureAnswerableUsersForComplaint(id);
    }

    if (Array.isArray(b.audioVideo)) {
      for (const av of b.audioVideo) {
        await executeNonQuery(
          `INSERT INTO tbl_AudioVideoAttachment (ComplaintID, Attachment, EntryDate, UserID)
           VALUES (@compId, @attachment, GETDATE(), @userId)`,
          { compId: id, attachment: av.attachment || av.path || null, userId }
        );
      }
    }

    // ----- Status transitions -----

    // Preview save: keep the record as a draft. Do not change the status and do
    // not assign it to an SO - that only happens on an actual submit. If the
    // complaint was already submitted, just save the edits and leave it as is.
    if (isDraft) {
      if (wasDraft) {
        await executeNonQuery('UPDATE tbl_NewComplaint SET IsTemp=1 WHERE CompID=@id', { id });
      }
      return res.json({
        message: 'Draft saved',
        CompID: id,
        CompNo: cur.CompNo,
        StatusID: Number(cur.StatusID),
        IsTemp: wasDraft ? 1 : Number(cur.IsTemp) || 0,
      });
    }

    // Submitting a draft for the first time: mark it final and let the DP
    // auto-assign it to the fixed SO (Status 2), exactly like a fresh complaint.
    if (wasDraft) {
      const fixedSO = await resolveFixedSO();
      await executeNonQuery('UPDATE tbl_NewComplaint SET IsTemp=0 WHERE CompID=@id', { id });
      if (fixedSO) {
        const alreadyAssigned = await query(
          `SELECT TOP 1 CompStatusID FROM tbl_ComplaintStatus
           WHERE CompaintID=@id AND StatusID=2 AND UserToID IS NOT NULL`,
          { id }
        );
        if (!alreadyAssigned.length) {
          await executeNonQuery(
            `INSERT INTO tbl_ComplaintStatus (CompaintID, StatusID, UserID, UserToID, StatusDate, Remarks)
             VALUES (@id, 2, @userId, @userToId, GETDATE(), 'Auto-assigned to fixed SO as per DC Flow')`,
            { id, userId, userToId: fixedSO }
          );
        }
        await executeNonQuery('UPDATE tbl_NewComplaint SET StatusID=2 WHERE CompID=@id', { id });
        return res.json({
          message: 'Complaint submitted successfully',
          CompID: id,
          CompNo: cur.CompNo,
          StatusID: 2,
          IsTemp: 0,
        });
      }
      // No SO could be resolved: remains Status 1 for manual assignment by the DD.
      await executeNonQuery('UPDATE tbl_NewComplaint SET StatusID=1 WHERE CompID=@id', { id });
      return res.json({
        message: 'Complaint submitted successfully',
        CompID: id,
        CompNo: cur.CompNo,
        StatusID: 1,
        IsTemp: 0,
      });
    }

    // ----- Move back to the SO for re-scrutiny (Status 4) -----
    await executeNonQuery('UPDATE tbl_NewComplaint SET StatusID=4 WHERE CompID=@id', { id });

    // Route back to the same SO who flagged the defect (latest Status-3 record)
    const soRow = await query(
      `SELECT TOP 1 UserID FROM tbl_ComplaintStatus
       WHERE CompaintID=@id AND StatusID=3 ORDER BY CompStatusID DESC`,
      { id }
    );
    const soUserId = soRow.length ? soRow[0].UserID : null;

    await executeNonQuery(
      `INSERT INTO tbl_ComplaintStatus (CompaintID, StatusID, UserID, UserToID, StatusDate, Remarks)
       VALUES (@id, 4, @userId, @userToId, GETDATE(), 'Complaint Modified')`,
      { id, userId, userToId: soUserId }
    );

    res.json({ message: 'Complaint updated and resubmitted successfully', StatusID: 4 });
  } catch (e) {
    console.error('update complaint error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /api/complaints/:id/scrutiny
 * Save SO scrutiny details: Entity in respect of which misconduct alleged,
 * Nature of allegation, and the full 19-point Scrutiny Sheet (JSON).
 * Mirrors ASPX btnMisconductAlleged_Click + btnSaveNatureOfAllegation_Click
 * (both write to tbl_NewComplaint). Only the fields provided are updated, so a
 * sheet-only save does not wipe previously entered scrutiny details.
 * Body: { entityMisconduct?, natureOfAllegation?, natureDetails?, scrutinySheet? }
 */
router.put('/:id/scrutiny', async (req, res) => {
  try {
    const id = req.params.id;
    const entityMisconduct = (req.body.entityMisconduct || '').trim();
    const natureOfAllegation = (req.body.natureOfAllegation || '').trim();
    const natureDetails = (req.body.natureDetails || '').trim();
    const scrutinySheet =
      req.body.scrutinySheet !== undefined && req.body.scrutinySheet !== null
        ? JSON.stringify(req.body.scrutinySheet)
        : null;

    const sets = [];
    const p = { id };
    if (entityMisconduct) {
      sets.push('EntityMisconduct=@entity');
      p.entity = entityMisconduct;
    }
    if (natureOfAllegation) {
      sets.push('NatureOfAllegation=@nature');
      p.nature = natureOfAllegation;
    }
    if (natureDetails) {
      sets.push('NatureDatails=@natureDetails');
      p.natureDetails = natureDetails;
    }
    if (scrutinySheet !== null) {
      sets.push('ScrutinySheet=@sheet');
      p.sheet = scrutinySheet;
    }
    if (!sets.length) {
      return res.status(400).json({ error: 'Nothing to save' });
    }
    await executeNonQuery(
      `UPDATE tbl_NewComplaint SET ${sets.join(', ')} WHERE CompID=@id`,
      p
    );
    res.json({ message: 'Scrutiny details saved' });
  } catch (e) {
    console.error('save scrutiny error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/complaints/:id/status
 * Change a complaint's status (audit trail insert).
 * Mirrors ASPX UpdateStatus() semantics.
 * Body: { statusId, remarks, userToId?, attachment?, commonField?, extensionTime?, decisionValue? }
 *   - extensionTime: days requested (persisted to tbl_ComplaintStatus.ExtensionTime)
 *   - decisionValue: e.g. "Case Closed - AFRA" -> also logged in tbl_ComplaintSubStatus
 */
router.post('/:id/status', async (req, res) => {
  try {
    const id = req.params.id;
    const { statusId, remarks, userToId, attachment, commonField, extensionTime, decisionValue, clubbedWithCompId, clubRule } = req.body;
    const userId = req.user.UserID;

    // Rule 5(4): link / unlink the previous complaint the Director is acting on.
    if (clubbedWithCompId !== undefined) {
      const linkId = clubbedWithCompId === null || clubbedWithCompId === '' ? null : Number(clubbedWithCompId);
      if (linkId !== null) {
        // A complaint that is already clubbed or closed cannot take a new
        // complaint on board - the new complaint has to be dealt with on its
        // own merits.
        if (linkId === Number(id)) {
          return res.status(400).json({ error: 'A complaint cannot be clubbed with itself' });
        }
        const self = await query('SELECT CompNo, StatusID, ClubbedWithCompID FROM tbl_NewComplaint WHERE CompID=@id', { id });
        if (!self.length) {
          return res.status(404).json({ error: 'Complaint not found' });
        }
        const selfLinked = self[0].ClubbedWithCompID ? Number(self[0].ClubbedWithCompID) : null;
        if (selfLinked && selfLinked !== linkId) {
          return res.status(400).json({
            error: `Complaint ${self[0].CompNo || id} is already clubbed with another complaint. A new complaint cannot be clubbed with it.`,
          });
        }
        if (!selfLinked && CLUBBED_OR_CLOSED_STATUSES.includes(Number(self[0].StatusID))) {
          return res.status(400).json({
            error: `Complaint ${self[0].CompNo || id} is already clubbed/closed. A new complaint cannot be clubbed with it.`,
          });
        }
        const target = await query('SELECT CompNo, StatusID, ClubbedWithCompID FROM tbl_NewComplaint WHERE CompID=@t', { t: linkId });
        if (!target.length) {
          return res.status(400).json({ error: 'The previous complaint could not be found' });
        }
        if (target[0].ClubbedWithCompID) {
          return res.status(400).json({
            error: `Complaint ${target[0].CompNo} is already clubbed with another complaint. A new complaint cannot be clubbed with it.`,
          });
        }
        // Rule 5(4)(c) - orders have already been passed on the previous
        // complaint, so the new complaint is taken up for closure before the
        // Board of Discipline. Every other case needs a complaint that is
        // still open.
        const isClosure = String(clubRule || '').toLowerCase() === 'c';
        if (!isClosure && CLUBBED_OR_CLOSED_STATUSES.includes(Number(target[0].StatusID))) {
          return res.status(400).json({
            error: `Complaint ${target[0].CompNo} is already clubbed/closed. A new complaint cannot be clubbed with it.`,
          });
        }
      }
      await executeNonQuery(
        'UPDATE tbl_NewComplaint SET ClubbedWithCompID=@c, ClubRule=@r WHERE CompID=@id',
        { c: linkId, r: clubRule || null, id }
      );
    }
    const ext = extensionTime != null && extensionTime !== '' ? Number(extensionTime) : null;

    // No duplicate entries for the same status at the same level (mirrors the
    // ASPX UpdateStatus() guard). If the complaint is already parked at the
    // submitted status, only touch the latest entry instead of inserting a new
    // history row. This keeps link/unlink and re-submission functional without
    // accumulating duplicated rows.
    const latestRow = await query(
      'SELECT TOP 1 CompStatusID, StatusID FROM tbl_ComplaintStatus WHERE CompaintID=@id ORDER BY CompStatusID DESC',
      { id }
    );
    const alreadyParked = latestRow.length && Number(latestRow[0].StatusID) === Number(statusId);

    if (alreadyParked) {
      await executeNonQuery(
        `UPDATE tbl_ComplaintStatus
           SET UserToID=@userToId,
               Remarks=COALESCE(@remarks, Remarks),
               Attachment=COALESCE(@attachment, Attachment),
               CommonField=COALESCE(@commonField, CommonField),
               ExtensionTime=COALESCE(@extensionTime, ExtensionTime)
         WHERE CompStatusID=@csid`,
        {
          userToId: userToId || null,
          remarks: remarks || null,
          attachment: attachment || null,
          commonField: commonField || null,
          extensionTime: ext,
          csid: Number(latestRow[0].CompStatusID),
        }
      );
      res.json({ message: 'Status updated', updated: true });
      return;
    }

    await executeNonQuery('UPDATE tbl_NewComplaint SET StatusID=@s WHERE CompID=@id', { s: statusId, id });
    await executeNonQuery(
      `INSERT INTO tbl_ComplaintStatus (CompaintID, StatusID, UserID, UserToID, StatusDate, Remarks, Attachment, CommonField, ExtensionTime)
       VALUES (@id, @s, @userId, @userToId, GETDATE(), @remarks, @attachment, @commonField, @extensionTime)`,
      {
        id,
        s: statusId,
        userId,
        userToId: userToId || null,
        remarks: remarks || null,
        attachment: attachment || null,
        commonField: commonField || null,
        extensionTime: ext,
      }
    );
    if (decisionValue) {
      await executeNonQuery(
        `INSERT INTO tbl_ComplaintSubStatus (StatusID, UserID, Remarks, CompID, Decision, Decisiondate)
         VALUES (@s, @userId, @remarks, @id, @decisionValue, GETDATE())`,
        {
          s: statusId,
          userId,
          remarks: remarks || null,
          id,
          decisionValue,
        }
      );
    }
    res.json({ message: 'Status updated' });
  } catch (e) {
    console.error('update status error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/complaints
 * Create a new complaint (mirrors FileNewComplaint.aspx final save).
 * Body: full complaint payload with nested grid arrays.
 */
router.post('/', async (req, res) => {
  try {
    const b = req.body;
    const userId = req.user.UserID;
    const year = new Date().getFullYear();
    const userType = Number(req.user.UserType);
    // Only the parties (complainant / respondent) and the internal staff file
    // complaints; other internal roles work on the cases assigned to them.
    if (![1, 2, 3, 4].includes(userType)) {
      return res.status(403).json({ error: 'Your account is not allowed to file a complaint' });
    }
    // A preview is persisted as a draft (IsTemp=1). Drafts are hidden from the
    // complaint register and are NOT auto-assigned to an SO; assignment happens
    // only when the complainant later submits the complaint.
    const isDraft = b.isDraft === true || b.isDraft === 1 || b.isDraft === '1';

    // Determine gov prefix from complaint type
    const compType = await query('SELECT CompTypeID, CompTypeName, IsGov FROM tbl_CompType WHERE CompTypeID=@id', {
      id: b.compTypeId || 0,
    });
    const isGov = compType.length > 0 && Number(compType[0].IsGov) === 1;
    const { compNo, complaintNo } = await generateComplaintNo(isGov, year);
    const initialStatus = 1;

    // Complainant details: if UserType=4 (DD) filing for someone, use body fields; otherwise from logged-in user
    let complainant;
    if (userType === 4) {
      complainant = [{
        NameOfTheUser: b.name || null,
        Email: b.email || null,
        Mob: b.mobile || null,
        CountryCode: b.countryCode || '91',
        Address: b.address || null,
        Area: b.area || null,
        Landmark: b.landmark || null,
        StateID: b.stateId || null,
        CityID: b.cityId || null,
        Pincode: b.pincode || null,
        STDCode: b.stdCode || null,
        LandlineNo: b.landlineNo || null,
        AadharNo: b.aadharNo || null,
        AadharPhoto: b.aadharPhoto || null,
        ComplaintantPhoto: b.complaintantPhoto || null,
        ComplaintantSignature: b.complaintantSignature || null,
        Region: b.complainantRegion || null,
      }];
    } else {
      complainant = await query(
        'SELECT NameOfTheUser, Email, Mob, CountryCode, Address, Area, Landmark, StateID, CityID, Pincode, STDCode, LandlineNo, Region FROM tbl_Users WHERE UserID=@id',
        { id: userId }
      );
    }
    const c = complainant.length ? complainant[0] : {};

    // Lookup region from state if complainant state is provided
    let complainantRegion = b.complainantRegion || c.Region || null;
    const complainantStateId = b.stateId || c.StateID || null;
    if (complainantStateId && !complainantRegion) {
      try {
        const regionRow = await query('SELECT Region FROM tbl_StateMaster WHERE StateID=@sid', { sid: complainantStateId });
        if (regionRow.length) complainantRegion = regionRow[0].Region;
      } catch (_) {}
    }

    // Lookup respondent region from state
    let resRegion = b.resRegion || null;
    if (b.resStateId && !resRegion) {
      try {
        const rr = await query('SELECT Region FROM tbl_StateMaster WHERE StateID=@sid', { sid: b.resStateId });
        if (rr.length) resRegion = rr[0].Region;
      } catch (_) {}
    }

    const result = await query(
      `INSERT INTO tbl_NewComplaint
        (ComplaintNo, CompType, Name, EmailID, CountryCode, MobileNo, STDCode, LandlineNo,
         Address, Area, Landmark, AadharNo, AadharPhoto, ComplaintantPhoto, ComplaintantSignature,
         ResName, ResRegistrationNo, ResCountryCode, ResMobileNo, ResSTDCode, ResLandlineNo,
         ResProfAddress, ResCommAddress, ResEmailID,
         BriefStatement, BriefAttachment, ParticularMisconduct, MisconductAttachment,
         PaymentMode, PaymentDate, TransRefNo, GSTINNo, InstrumentNo, InstrumentDate,
         TaxableAmount, TaxRate, PaymentDetails,
         UserID, EntryDate, StatusID, StateID, CityID, PinCode, Region,
         CompNo, Year,
         RStateName, RCityName, RStateID, RCityID, RRegion, RComRegion,
         Salutation, RelationName,
         RegulatorName, RegulatorDesignation, RegulatorID, RegulatorAttachment, PersonName,
         IsFirm, NameofFirm, FirmNo, FirmProfAddress, FirmCommAddress,
         FirmProfStateID, FirmProfCityID,
         IsTemp, FormType,
         InvestigatingReport, IsInvestigatingReportAvailable,
         GSTType, IsAnswerable, Declaration, IsAudioVideo,
         EntityMisconduct, isChkSameAddress,
         NatureOfAllegation, NatureDatails)
       OUTPUT INSERTED.CompID
       VALUES
        (@complaintNo, @compType, @name, @email, @countryCode, @mobile, @stdCode, @landlineNo,
         @address, @area, @landmark, @aadharNo, @aadharPhoto, @photo, @signature,
         @resName, @resReg, @resCountry, @resMobile, @resStd, @resLandline,
         @resProfAddr, @resCommAddr, @resEmail,
         @brief, @briefAttach, @misconduct, @misconductAttach,
         @paymentMode, @paymentDate, @transRef, @gstIn, @instrumentNo, @instrumentDate,
         @taxable, @taxRate, @paymentDetails,
         @userId, GETDATE(), @initialStatus, @stateId, @cityId, @pincode, @region,
         @compNo, @year,
         @rStateName, @rCityName, @rStateId, @rCityId, @rRegion, @rComRegion,
         @salutation, @relationName,
         @regulatorName, @regulatorDesignation, @regulatorId, @regulatorAttach, @personName,
         @isFirm, @nameOfFirm, @firmNo, @firmProfAddr, @firmCommAddr,
         @firmProfStateId, @firmProfCityId,
         @isTemp, @formType,
         @investReport, @isInvestReport,
         @gstType, @isAnswerable, @declaration, @isAudioVideo,
         @entityMisconduct, @isChkSameAddress,
         @nature, @natureDetails)`,
      {
        complaintNo,
        compType: b.compTypeId || null,
        name: c.NameOfTheUser || null,
        email: c.Email || null,
        countryCode: c.CountryCode || '91',
        mobile: c.Mob || null,
        stdCode: b.stdCode || null,
        landlineNo: b.landlineNo || null,
        address: b.address || c.Address || null,
        area: b.area || c.Area || null,
        landmark: b.landmark || c.Landmark || null,
        aadharNo: b.aadharNo || null,
        aadharPhoto: b.aadharPhoto || null,
        photo: b.complaintantPhoto || null,
        signature: b.complaintantSignature || null,
        resName: b.resName || null,
        resReg: b.isFirm ? null : b.resRegistrationNo || null,
        resCountry: b.resCountryCode || '91',
        resMobile: b.resMobile || null,
        resStd: b.resStdCode || null,
        resLandline: b.resLandlineNo || null,
        resProfAddr: b.resProfessionalAddress || null,
        resCommAddr: b.resCommunicationAddress || null,
        resEmail: b.resEmail || null,
        brief: b.briefStatement || null,
        briefAttach: b.briefAttachment || null,
        misconduct: b.particularMisconduct || null,
        misconductAttach: b.misconductAttachment || null,
        paymentMode: b.paymentMode || null,
        paymentDate: b.paymentDate || null,
        transRef: b.transRefNo || null,
        gstIn: b.gstinNo || null,
        instrumentNo: b.instrumentNo || null,
        instrumentDate: b.instrumentDate || null,
        taxable: b.taxableAmount || null,
        taxRate: b.taxRate || null,
        paymentDetails: b.paymentDetails || null,
        userId,
        initialStatus,
        stateId: complainantStateId,
        cityId: b.cityId || c.CityID || null,
        pincode: b.pincode || c.Pincode || null,
        region: complainantRegion,
        compNo,
        year,
        rStateName: b.rStateName || null,
        rCityName: b.rCityName || null,
        rStateId: b.resStateId || null,
        rCityId: b.resCityId || null,
        rRegion: resRegion || b.resRegion || null,
        rComRegion: b.resComRegion || resRegion || null,
        salutation: b.salutation || null,
        relationName: b.relationName || null,
        regulatorName: b.regulatorName || null,
        regulatorDesignation: b.regulatorDesignation || null,
        regulatorId: b.regulatorId || null,
        regulatorAttach: b.regulatorAttachment || null,
        personName: b.personName || null,
        isFirm: b.isFirm ? 1 : 0,
        nameOfFirm: b.nameOfFirm || (b.isFirm ? b.resName : null),
        firmNo: b.firmNo || null,
        firmProfAddr: b.firmProfAddress || null,
        firmCommAddr: b.firmCommAddress || null,
        firmProfStateId: b.firmProfStateId || null,
        firmProfCityId: b.firmProfCityId || null,
        isTemp: isDraft ? 1 : 0,
        formType: b.formType || null,
        investReport: b.investigatingReport || null,
        isInvestReport: b.isInvestigatingReportAvailable ? 1 : 0,
        gstType: b.gstType || null,
        isAnswerable: b.isAnswerable || 0,
        declaration: b.declaration ? 1 : 0,
        isAudioVideo: b.isAudioVideo || 0,
        entityMisconduct: b.entityMisconduct || null,
        isChkSameAddress: b.isChkSameAddress ? 1 : 0,
        nature: b.natureOfAllegation || null,
        natureDetails: b.natureOfAllegation || null,
      }
    );

    const compId = result[0].CompID;

    // Insert initial status record
    await executeNonQuery(
      `INSERT INTO tbl_ComplaintStatus (CompaintID, StatusID, UserID, StatusDate, Remarks)
       VALUES (@id, @initialStatus, @userId, GETDATE(), 'New Complaint')`,
      { id: compId, initialStatus, userId }
    );

    // DC Flow step 1: the DP auto-assigns the received complaint to the fixed SO
    // for scrutiny (Status 2). If no SO is resolvable, the complaint stays at
    // Status 1 (Complaint Received) for a manual assignment by the DD.
    // Drafts are never assigned - they wait until the complainant submits.
    if (!isDraft) {
      const fixedSO = await resolveFixedSO();
      if (fixedSO) {
        await executeNonQuery(
          `INSERT INTO tbl_ComplaintStatus (CompaintID, StatusID, UserID, UserToID, StatusDate, Remarks)
           VALUES (@id, 2, @userId, @userToId, GETDATE(), 'Auto-assigned to fixed SO as per DC Flow')`,
          { id: compId, userId, userToId: fixedSO }
        );
        await executeNonQuery('UPDATE tbl_NewComplaint SET StatusID=2 WHERE CompID=@id', { id: compId });
      }
    }

    // --- Insert grid/detail records ---

    // Documents
    if (Array.isArray(b.documents)) {
      for (const doc of b.documents) {
        await executeNonQuery(
          `INSERT INTO tbl_ComplaintDocument (CompID, DocumentID, DocURL, EntryDate)
           VALUES (@compId, @docId, @docUrl, GETDATE())`,
          { compId, docId: doc.documentId || doc.name || null, docUrl: doc.docUrl || doc.path || null }
        );
      }
    }

    // Fact Persons
    if (Array.isArray(b.factPersons)) {
      for (const p of b.factPersons) {
        await executeNonQuery(
          `INSERT INTO tbl_FactPersons (CompID, PersonName, PersonMobile, PersonEmail, UserID)
           VALUES (@compId, @name, @mobile, @email, @userId)`,
          { compId, name: p.personName || null, mobile: p.personMobile || null, email: p.personEmail || null, userId }
        );
      }
    }

    // Schedules (Misconduct)
    if (Array.isArray(b.schedules)) {
      for (const s of b.schedules) {
        await executeNonQuery(
          `INSERT INTO tbl_ScheduleList (CompID, Schedule, PartNo, ItemNo, MisconductDate, MisconductDateTo, Miscondate, UserID)
           VALUES (@compId, @schedule, @partNo, @itemNo, @misconDate, @misconDateTo, @misconDate, @userId)`,
          {
            compId,
            schedule: s.schedule || null,
            partNo: s.partNo || null,
            itemNo: s.itemNo || null,
            misconDate: s.misconductDate || null,
            misconDateTo: s.misconductDateTo || null,
            userId,
          }
        );
      }
    }

    // Answerable Members (for firms)
    if (Array.isArray(b.answerableMembers)) {
      for (const m of b.answerableMembers) {
        await executeNonQuery(
          `INSERT INTO tbl_AnswerableMember
            (CompID, MemName, MemRegistrationNo, MemCountryCode, MemMobileNo, MemSTDCode, MemLandlineNo,
             MemProAddress, MemCommAddress, MemStateName, MemCityName, MemCommStateID, MemCommCityID,
             MemProRegion, MemCommRegion, MemEmailID, FirmNo, UserID)
           VALUES
            (@compId, @name, @regNo, @countryCode, @mobile, @stdCode, @landline,
             @proAddr, @commAddr, @stateName, @cityName, @commStateId, @commCityId,
             @proRegion, @commRegion, @email, @firmNo, @userId)`,
          {
            compId,
            name: m.memName || null,
            regNo: m.memRegistrationNo || null,
            countryCode: m.memCountryCode || null,
            mobile: m.memMobileNo || null,
            stdCode: m.memSTDCode || null,
            landline: m.memLandlineNo || null,
            proAddr: m.memProAddress || null,
            commAddr: m.memCommAddress || null,
            stateName: m.memProState || null,
            cityName: m.memProCity || null,
            commStateId: m.memCommStateId || null,
            commCityId: m.memCommCityId || null,
            proRegion: m.memProRegion || null,
            commRegion: m.memCommRegion || null,
            email: m.memEmailID || null,
            firmNo: m.firmNo || null,
            userId,
          }
        );
      }
    }

    // Give every answerable member their own login so they can file the
    // written statement for the firm complaint.
    await ensureAnswerableUsersForComplaint(compId);

    // Audio/Video attachments
    if (Array.isArray(b.audioVideo)) {
      for (const av of b.audioVideo) {
        await executeNonQuery(
          `INSERT INTO tbl_AudioVideoAttachment (ComplaintID, Attachment, EntryDate, UserID)
           VALUES (@compId, @attachment, GETDATE(), @userId)`,
          { compId, attachment: av.attachment || av.path || null, userId }
        );
      }
    }

    res.status(201).json({ CompID: compId, CompNo: compNo, IsTemp: isDraft ? 1 : 0 });
  } catch (e) {
    console.error('create complaint error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});


/**
 * GET /api/complaints/:id/clubbed-list
 * All complaints clubbed with this complaint (where ClubbedWithCompID = :id)
 */
router.get('/:id/clubbed-list', async (req, res) => {
  try {
    const id = req.params.id;
    const rows = await query(
      `SELECT nc.CompID, nc.CompNo, nc.Name AS ComplainantName, nc.ResName, nc.ResEmailID,
              nc.StatusID, sm.StatusName, nc.EntryDate, nc.ClubRule, nc.UserID,
              nc.ClubbedWithCompID, pc.CompNo AS PreviousCompNo,
              pc.StatusID AS PreviousStatusID, pcs.StatusName AS PreviousStatusName
       FROM tbl_NewComplaint nc
       LEFT JOIN tbl_StatusMaster sm ON nc.StatusID = sm.StatusID
       LEFT JOIN tbl_NewComplaint pc ON nc.ClubbedWithCompID = pc.CompID
       LEFT JOIN tbl_StatusMaster pcs ON pc.StatusID = pcs.StatusID
       WHERE nc.ClubbedWithCompID = @id AND (nc.IsTemp IS NULL OR nc.IsTemp=0)
       ORDER BY nc.EntryDate ASC`,
      { id }
    );
    res.json(rows);
  } catch (e) {
    console.error('clubbed list error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
