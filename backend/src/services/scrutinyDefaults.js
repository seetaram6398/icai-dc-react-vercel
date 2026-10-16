/**
 * Scrutiny Sheet auto-fill.
 *
 * The Scrutiny Sheet (in terms of the Chartered Accountants (Procedure of
 * Investigations of Professional and Other Misconduct and Conduct of Cases)
 * Rules, 2007) is mostly a factual transcription of data the Institute already
 * holds on the complaint, so those cells are filled in automatically the moment
 * the sheet is opened. Only the questions that need an officer's judgement
 * (defects, Rule 3 verification, withdrawal, prima facie opinion, etc.) are left
 * blank for the Scrutiny Officer to answer.
 *
 * This module is the single source of truth for those defaults: it feeds both
 * the on-screen form (GET /scrutiny/prefill) and the downloadable PDF
 * (GET /scrutiny/pdf).
 */

const PAY_MODE_LABELS = { 1: 'Cash', 2: 'NEFT', 3: 'Net Banking', 4: 'DD' };

function pad(n) {
  return String(n).padStart(2, '0');
}

/** yyyy-mm-dd, the format <input type="date"> expects. */
function isoDate(v) {
  if (!v) return '';
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function humanDate(v) {
  const iso = isoDate(v);
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function text(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function join(parts, sep) {
  return parts.map(text).filter(Boolean).join(sep || ', ');
}

function addressLine(parts) {
  return join(parts.filter((p) => text(p)));
}

/** Every cell of the sheet, blank by default. */
function emptySheet(compNo) {
  const d = { cno: text(compNo) };
  [
    'q1a', 'q1b', 'q1d', 'q1e',
    'q2a', 'q2b', 'q3a', 'q3b', 'q4a', 'q4b', 'q5', 'q5b', 'q6',
    'q7', 'q7a', 'q7a1', 'q7a1_det', 'q7a2', 'q7b', 'q7b1', 'q7b1_det', 'q7b2',
    'q7c', 'q7c1', 'q7d', 'q7d1',
    'q8a', 'q8b', 'q8b1',
    'q9', 'q9a', 'q9b', 'q9c', 'q9d',
    'q10a', 'q10a1', 'q10b', 'q10a3',
    'q11a', 'q11a1', 'q11a2', 'q11a3', 'q11a4', 'q11a5',
    'q12',
    'q13a', 'q13b', 'q13b2', 'q13c',
    'q14', 'q15', 'q16', 'q17', 'q18', 'q19', 'foot',
  ].forEach((k) => {
    d[k] = '';
  });
  d.mode = '';
  return d;
}

/**
 * Rule 12: a complaint is barred once 7 years have elapsed from the date of the
 * alleged misconduct. Returns YES/NO, or '' when no date is on record so the
 * officer decides.
 *
 * `misconductTo` is the period end on file; when no single start date was
 * recorded we fall back to it. SQL Server's zero-ish sentinel (1900-01-01) and
 * any pre-1970 placeholder is ignored rather than read as "very old".
 */
function timeLimitElapsed(misconductFrom, entryDate, misconductTo) {
  const parse = (v) => {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1970) return null;
    return d;
  };
  const from = parse(misconductFrom) || parse(misconductTo);
  const to = parse(entryDate);
  if (!from) return '';
  const ref = to || new Date();
  return ref.getTime() - from.getTime() > 7 * 365.25 * 86400000 ? 'YES' : 'NO';
}

/**
 * @param {Object} c      tbl_NewComplaint row (+ Complainant* / Respondent* joins)
 * @param {Array}  history  tbl_ComplaintStatus rows for the complaint
 * @param {Array}  answerable  tbl_AnswerableMember rows
 * @param {Object} [extra]    { documentCount }
 */
function buildScrutinyDefaults(c, history, answerable, extra) {
  const d = emptySheet(c && c.CompNo);
  if (!c) return d;

  const hist = history || [];
  const answer = answerable || [];
  const byStatus = (id) => hist.filter((h) => Number(h.StatusID) === Number(id));
  const earliest = (id) => {
    const rows = byStatus(id).slice().sort((a, b) => new Date(a.StatusDate) - new Date(b.StatusDate));
    return rows[0] || null;
  };

  // ---------- 1. Receipt ----------
  d.q1a = isoDate(c.EntryDate);
  d.q1b = isoDate((earliest(2) || {}).StatusDate);
  const endorsing = earliest(1) || earliest(2);
  d.q1d = text(endorsing && endorsing.ByUserName);

  // ---------- 2. Complainant / Respondent ----------
  const compAddress = addressLine([
    c.ComplainantAddress || c.Address,
    c.ComplainantArea || c.Area,
    c.ComplainantLandmark || c.Landmark,
    c.ComplainantCity || c.City,
    c.ComplainantPincode || c.Pincode,
  ]);
  d.q2a = join([
    text(c.ComplainantName),
    c.ComplainantMembershipNo ? `MRN: ${text(c.ComplainantMembershipNo)}` : '',
    compAddress,
    text(c.ComplainantEmail),
    text(c.ComplainantMobile) ? `Mobile: ${text(c.ComplainantMobile)}` : '',
  ]);
  d.q2b = join([
    text(c.ResName),
    c.NameofFirm ? `Firm: ${text(c.NameofFirm)}` : '',
    text(c.ResRegistrationNo) ? `MRN/FRN: ${text(c.ResRegistrationNo)}` : '',
    text(c.ResProfAddress),
    text(c.ResEmailID),
    text(c.ResMobileNo) ? `Mobile: ${text(c.ResMobileNo)}` : '',
  ]);

  // ---------- 3 & 4. Firm / individual respondent ----------
  const isFirm = Number(c.IsFirm) === 1 || !!text(c.NameofFirm) || !!text(c.FirmNo);
  d.q3a = isFirm ? addressLine([c.FirmProfAddress || c.ResProfAddress, c.RStateName, c.RCityname]) : '';
  d.q3b = isFirm ? text(c.FirmNo || c.ResRegistrationNo) : '';
  d.q4a = isFirm ? '' : text(c.ResName);
  d.q4b = isFirm ? '' : join([text(c.ResRegistrationNo), text(c.Region)]);

  // ---------- 5 & 6. Respondents & place ----------
  const multi = answer.length > 1;
  d.q5 = answer.length ? (multi ? 'YES' : 'NO') : '';
  d.q5b = multi
    ? answer
        .map((m) => join([text(m.MemName), text(m.MemRegistrationNo) ? `MRN: ${text(m.MemRegistrationNo)}` : '']))
        .join('\n')
    : '';
  d.q6 = addressLine([c.ResProfAddress, c.RStateName, c.RCityname]);

  // ---------- 7. Capacity in which the complaint is filed ----------
  // Complaints filed by a Government Department / statutory authority are not
  // signed by the individual complainant, so Rule 3(2)-(4) apply instead.
  const onBehalf = !!text(c.RegulatorID || c.RegulatorName);
  d.q7 = onBehalf ? 'NO' : 'YES';

  // ---------- 8. Complaint fee ----------
  d.q8a = onBehalf ? 'YES' : 'NO';
  const fee = Number(c.TaxableAmount);
  d.q8b = fee > 0 ? 'YES' : 'NO';
  if (fee > 0) {
    d.q8b1 = join([
      fee ? `Amount: Rs. ${fee.toLocaleString('en-IN')}` : '',
      c.PaymentDate ? `Date: ${humanDate(c.PaymentDate)}` : '',
      PAY_MODE_LABELS[c.PaymentMode] ? `Mode: ${PAY_MODE_LABELS[c.PaymentMode]}` : '',
      text(c.InstrumentNo) ? `DD No.: ${text(c.InstrumentNo)}` : '',
      c.InstrumentDate ? `Instrument date: ${humanDate(c.InstrumentDate)}` : '',
      text(c.TransRefNo) ? `Transaction Ref. No.: ${text(c.TransRefNo)}` : '',
      text(c.PaymentDetails),
    ]);
  }

  // ---------- 12. Rule 12 time limit ----------
  d.q12 = timeLimitElapsed(c.MisconductDate, c.EntryDate, c.MisConductDateTo);

  // ---------- 13(a). Completeness ----------
  d.q13a = text(c.BriefStatement) && text(c.ParticularMisconduct) ? 'YES' : 'NO';

  // ---------- Foot note ----------
  const sets = text(c.FormType).match(/(\d+)\s*set/i);
  d.foot = [
    `Complaint in Form 'I' received in ${sets ? sets[1] : 'one'} set.`,
    `Complaint fee: ${fee > 0 ? `received (Rs. ${fee.toLocaleString('en-IN')})` : 'not received'}.`,
    `Documents received: ${Number(extra && extra.documentCount) || 0}.`,
  ].join(' ');

  return d;
}

module.exports = { buildScrutinyDefaults, emptySheet, isoDate, humanDate };