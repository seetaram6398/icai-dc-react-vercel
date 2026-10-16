const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { query } = require('../config/db');
const { buildScrutinyDefaults } = require('./scrutinyDefaults');

const A4 = [595.28, 841.89];
const M = 40;
const CW = A4[0] - M * 2;

const NAVY = rgb(0.13, 0.21, 0.31);
const DARK = rgb(0.15, 0.18, 0.22);
const GRAY = rgb(0.45, 0.45, 0.45);
const WHITE = rgb(1, 1, 1);
const LINE = rgb(0.78, 0.82, 0.88);

function wrapLines(font, size, text, maxWidth) {
  const out = [];
  for (const raw of String(text == null ? '' : text).split('\n')) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (line && font.widthOfTextAtSize(cand, size) > maxWidth) {
        out.push(line);
        line = w;
      } else {
        line = cand;
      }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [''];
}

/**
 * Every numbered row of the Scrutiny Sheet in the order it appears on the
 * printed form. `d` is the sheet values (saved values merged over the
 * auto-filled defaults).
 */
function sheetRows(d) {
  const v = (k) => (d && d[k] ? String(d[k]) : '');
  const withDetail = (k, dk) => (d && d[k] && d[dk] ? `${d[k]} - ${d[dk]}` : d && d[dk] ? d[dk] : v(k));

  return [
    ['1', 'Date of receipt in the Institute', v('q1a')],
    ['1', 'Date of Receipt in the Disciplinary Directorate (Rule 3 proviso)', v('q1b')],
    ['1', 'Mode of Receipt (Rule 3(1))', v('mode')],
    ['1', 'Name & Designation of the Officer endorsing complaint (including Director) (Rule 5(1))', v('q1d')],
    ['1', 'Date of acknowledgement sent to the Complainant (Rule 3(6))', v('q1e')],
    ['2', 'Complainant', v('q2a')],
    ['2', 'Respondent', v('q2b')],
    ['3', 'Place of H.O. of the Firm (if Complaint is against the Firm) (Rule 8(1)(b))', v('q3a')],
    ['3', 'Firm Registration Number', v('q3b')],
    ['4', 'Name of the Respondent (if Complaint is against individual) (Rule 8(1)(a))', v('q4a')],
    ['4', 'Membership Number and Region Concerned', v('q4b')],
    ['5', 'Whether Complaint is against more than one Respondent', v('q5')],
    ['5', 'If yes, their Names, Membership Numbers and Region concerned', v('q5b')],
    ['6', 'Place of Respondent(s) (as per professional address) (Rule 8(1)(a))', v('q6')],
    ['7', 'Whether the Complaint is signed, verified and forwarded by the same individual (in his individual capacity)', v('q7')],
    ['7(a)', 'If no, whether the Complaint is filed on behalf of the Government - Central or State (Rule 3(2))', v('q7a')],
    ['7(a)', 'If yes, whether authorization for filing the Complaint has been made by an officer holding the rank of Joint Secretary, equivalent rank or above in the respective Government (Rule 3(2))', withDetail('q7a1', 'q7a1_det')],
    ['7(a)', 'If yes, whether the Complaint has also been signed by an authorized person, namely an officer holding the rank of Under Secretary, equivalent rank or above (Rule 3(2))', v('q7a2')],
    ['7(b)', 'Whether the Complaint has been filed on behalf of a statutory authority (e.g., RBI, SEBI etc.) (Rule 3(3))', v('q7b')],
    ['7(b)', 'If yes, whether authorization has been made by an officer holding a post equivalent to the rank of Joint Secretary in Government of India (Rule 3(3))', withDetail('q7b1', 'q7b1_det')],
    ['7(b)', 'If yes, whether the Complaint has also been signed by the authorized person, (e.g., an officer holding a post equivalent to the rank of Under Secretary) (Rule 3(3))', v('q7b2')],
    ['7(c)', 'Whether the Complaint has been filed on behalf of a Company or Firm (Rule 3(4))', v('q7c')],
    ['7(c)', 'If yes, whether the Board / Partners / Managing Committee Resolution has been received (Rule 3(4))', v('q7c1')],
    ['7(d)', 'Whether the Complaint has been filed on behalf of the Bank or Financial Institution (Rule 3(4) expl.)', v('q7d')],
    ['7(d)', 'If yes, whether any general Resolution or Power of Attorney has been received (Rule 3(4) expl.)', v('q7d1')],
    ['8(a)', 'Whether the complaint is eligible for fee waiver (Rule 4(1))', v('q8a')],
    ['8(b)', 'Whether the prescribed fee has been received (Rule 4(1))', v('q8b')],
    ['8(b)', 'If received, amount of fee, date, number of DD and name/address of Bank (Rule 4(2))', v('q8b1')],
    ['9', 'Whether subject matter of complaint is substantially same as or has been covered by any previous complaint or information (Rule 5(4))', v('q9')],
    ['9', 'If yes, whether the same is in process (unique reference number and current status) (Rule 5(4))', v('q9a')],
    ['9', 'If in process at the end of Director (Discipline) to club the new complaint with previous one (Rule 5(4)(a))', v('q9b')],
    ['9', 'If in process at the end of Board of Discipline or Disciplinary Committee, to place new Complaint before the respective authority (Rule 5(4)(b))', v('q9c')],
    ['9', 'If orders already passed by the respective authority then give relevant reference number (and place before the same authority for closure) (Rule 5(4)(c))', v('q9d')],
    ['10(a)', 'Whether the Complaint has been found to be defective (Rule 5(5))', v('q10a')],
    ['10(a)', 'If yes, whether to call the Complainant in person OR to return the complaint for rectification / Resubmission (Rule 5(5))', v('q10a1')],
    ['10(a)', 'Cut off date given for rectification / resubmission (Rule 5(5))', v('q10b')],
    ['10(a)', 'Whether rectification / resubmission made within the cut off date (Rule 5(6))', v('q10a3')],
    ['11(a)', 'Whether the complaint received is in accordance with the prescribed Form I (Rule 3(1))', v('q11a')],
    ['11(a)', 'If yes - Whether all the columns of Form I have been filled up, giving no room for any ambiguity', v('q11a1')],
    ['11(a)', 'Whether the verification has been correctly carried out', v('q11a2')],
    ['11(a)', 'Whether the documents stated to have been enclosed are found attached with the complaint', v('q11a3')],
    ['11(a)', 'Whether any paper is in Regional or Hindi language', v('q11a4')],
    ['11(a)', 'Whether the allegations made out, fall Under Section 21 together with schedule(s) and/or Section 22', v('q11a5')],
    ['12', 'Whether the time limit of 7 years as per Rule 12 has elapsed', v('q12')],
    ['13(a)', 'Whether complaint is complete in all respects (Rule 5(3))', v('q13a')],
    ['13(b)', 'Whether withdrawal of Complaint has been received from the Complainant (Rule 6)', v('q13b')],
    ['13(b)', 'If yes, the date of receipt of such withdrawal letter', v('q13b2')],
    ['13(c)', 'If yes, whether the complaint can be registered? (Rule 5(3))', v('q13c')],
    ['14', 'Whether notice has been sent to individual / firm within sixty days of receipt of complaint (Rule 8(1))', v('q14')],
    ['15', 'Whether statement of defence has been received from member within 21 days / extended time of service of notice', v('q15')],
    ['16', 'Whether the statement of defence forwarded to the complainant and date of service of such defence', v('q16')],
    ['17', 'Whether statement of rejoinder has been received from Complainant within 21 days / extended time of service of statement of defence', v('q17')],
    ['18', 'The date of forming prima facie opinion by the Director whether the defendant is guilty or not guilty and the details of schedule', v('q18')],
    ['19', 'In case the prima facie opinion held / not held guilty by Director Discipline is accepted or reversed by the Board of Discipline', v('q19')],
  ];
}

/**
 * Build the Scrutiny Sheet PDF for a complaint. Saved values win over the
 * auto-filled defaults, so the download always carries every value that is
 * currently on the form.
 */
async function buildScrutinyPdf(id) {
  const rows = await query(
    `SELECT nc.*,
            ct.CompTypeName,
            u.NameOfTheUser AS ComplainantName, u.Email AS ComplainantEmail, u.Mob AS ComplainantMobile,
            u.MembershipNo AS ComplainantMembershipNo, u.Address AS ComplainantAddress, u.Area AS ComplainantArea,
            u.Landmark AS ComplainantLandmark, u.City AS ComplainantCity, u.Pincode AS ComplainantPincode
     FROM tbl_NewComplaint nc
     LEFT JOIN tbl_CompType ct ON nc.CompType = ct.CompTypeID
     LEFT JOIN tbl_Users u ON nc.UserID = u.UserID
     WHERE nc.CompID=@id`,
    { id }
  );
  if (rows.length === 0) return null;
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

  const defaults = buildScrutinyDefaults(c, history, answerable, { documentCount: docCount[0] ? docCount[0].n : 0 });

  let saved = {};
  if (c.ScrutinySheet) {
    try {
      saved = JSON.parse(c.ScrutinySheet) || {};
    } catch (e) {
      saved = {};
    }
  }
  const d = { ...defaults };
  Object.keys(saved).forEach((k) => {
    if (saved[k] !== null && saved[k] !== undefined && String(saved[k]).trim() !== '') d[k] = saved[k];
  });
  if (c.CompNo) d.cno = c.CompNo;

  const doc = await PDFDocument.create();
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontR = await doc.embedFont(StandardFonts.Helvetica);

  let page = doc.addPage(A4);
  let y = A4[1] - M;

  function ensureSpace(needed) {
    if (y - needed < M) {
      page = doc.addPage(A4);
      y = A4[1] - M;
    }
  }

  function center(text, font, size, color) {
    page.drawText(text, { x: (A4[0] - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });
  }

  center('SCRUTINY SHEET', fontB, 15, NAVY);
  y -= 15;
  center(
    '(In terms of the Chartered Accountants (Procedure of Investigations of Professional and Other Misconduct and Conduct of Cases) Rules, 2007)',
    fontR,
    8.5,
    GRAY
  );
  y -= 16;
  page.drawText(`Complaint No. : ${d.cno || ''}`, { x: M, y, size: 10, font: fontB, color: DARK });
  y -= 6;
  page.drawRectangle({ x: M, y, width: CW, height: 0.8, color: NAVY });
  y -= 10;

  const numW = 30;
  const valW = CW * 0.28;
  const qW = CW - numW - valW;

  function row(num, question, value) {
    const qLines = wrapLines(fontR, 8.5, question || '', qW - 8);
    const vLines = value ? wrapLines(fontB, 8.5, value, valW - 8) : [];
    const rowH = Math.max(20, qLines.length * 11 + 6, vLines.length * 11 + 6);
    ensureSpace(rowH + 2);
    page.drawRectangle({ x: M, y: y - rowH, width: CW, height: 0.5, color: LINE });
    page.drawLine({ start: { x: M, y: y - rowH }, end: { x: M + CW, y: y - rowH }, thickness: 0.5, color: LINE });
    page.drawLine({ start: { x: M + numW, y: y - rowH }, end: { x: M + numW, y }, thickness: 0.5, color: LINE });
    page.drawLine({ start: { x: M + numW + qW, y: y - rowH }, end: { x: M + numW + qW, y }, thickness: 0.5, color: LINE });
    page.drawText(String(num), { x: M + numW / 2 - fontB.widthOfTextAtSize(String(num), 8.5) / 2, y: y - 12, size: 8.5, font: fontB, color: NAVY });
    qLines.forEach((l, i) => page.drawText(l, { x: M + numW + 4, y: y - 12 - i * 11, size: 8.5, font: fontR, color: DARK }));
    if (value) {
      vLines.forEach((l, i) => page.drawText(l, { x: M + numW + qW + 4, y: y - 12 - i * 11, size: 8.5, font: fontB, color: NAVY }));
    } else {
      page.drawText('-', { x: M + numW + qW + 4, y: y - 12, size: 8.5, font: fontR, color: GRAY });
    }
    y -= rowH;
  }

  // Group the rows under their top-level number so the form reads like the
  // printed sheet.
  let lastGroup = null;
  sheetRows(d).forEach(([num, question, value]) => {
    const group = num.replace(/[a-z()]/g, '') || num;
    if (group !== lastGroup) {
      lastGroup = group;
      const head = { 1: 'Receipt of the Complaint', 2: 'Parties', 3: 'Firm (Rule 8(1)(b))', 4: 'Individual Member (Rule 8(1)(a))', 5: 'Multiple Respondents', 6: 'Place of Respondent(s)', 7: 'Capacity of the Complainant (Rule 3)', 8: 'Complaint Fee (Rule 4)', 9: 'Previous Complaint / Information (Rule 5(4))', 10: 'Defective Complaint (Rule 5(5) & 5(6))', 11: 'Form I Verification (Rule 3(1))', 12: 'Limitation (Rule 12)', 13: 'Registration (Rule 5(3) & Rule 6)', 14: 'Notice to Respondent (Rule 8(1))', 15: 'Statement of Defence', 16: 'Forwarding of Defence', 17: 'Rejoinder', 18: 'Prima Facie Opinion', 19: 'Board of Discipline' }[group];
      ensureSpace(24);
      y -= 4;
      page.drawText(head || `Section ${group}`, { x: M, y, size: 9.5, font: fontB, color: NAVY });
      y -= 12;
    }
    row(num, question, value);
  });

  // ---------- Foot note block ----------
  const footText = [
    "Complaint in Form 'I' received in one set / duplicate / triplicate alongwith / without complaint fee and documents in one set / duplicate / triplicate.",
    'On scrutiny, no / following defects found.',
    d.foot || '',
  ].filter(Boolean).join('\n');
  const footLines = wrapLines(fontR, 8.5, footText, CW - 12);
  ensureSpace(footLines.length * 11 + 16);
  y -= 6;
  page.drawRectangle({ x: M, y: y - footLines.length * 11 - 10, width: CW, height: footLines.length * 11 + 10, borderColor: LINE, borderWidth: 0.6 });
  footLines.forEach((l, i) => page.drawText(l, { x: M + 6, y: y - 14 - i * 11, size: 8.5, font: fontR, color: DARK }));

  const total = doc.getPageCount();
  for (let i = 0; i < total; i += 1) {
    const p = doc.getPage(i);
    const s = `Page ${i + 1} of ${total}`;
    p.drawText(s, { x: (A4[0] - fontR.widthOfTextAtSize(s, 8)) / 2, y: 18, size: 8, font: fontR, color: GRAY });
  }

  const filenameBase = String(c.CompNo || id).replace(/[\\/]/g, '_');
  return { filename: `ScrutinySheet_${filenameBase}.pdf`, data: await doc.save() };
}

module.exports = { buildScrutinyPdf };