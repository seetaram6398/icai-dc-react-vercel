const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { put } = require('@vercel/blob');
const { query } = require('../config/db');

const DOC_ROOT = path.join(__dirname, '..', '..', '..', 'Documents');
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 52;
const MAX_WIDTH = PAGE_WIDTH - MARGIN * 2;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function cityState(city, state, pincode) {
  const c = clean(city);
  const s = clean(state);
  const p = clean(pincode);
  const place = [c, s].filter(Boolean).join(' (');
  const suffix = [place, p].filter(Boolean).join(')-');
  if (!c && !s) return p ? `-${p}` : '';
  if (p) return `${place}${s ? ')' : ''}-${p}`;
  return `${place}${s ? ')' : ''}`;
}

async function loadLetterContext(compId) {
  const rows = await query(
    `SELECT nc.*,
            cs.StateName AS ComplainantStateName, cc.CityName AS ComplainantCityName,
            rs.StateName AS RespondentStateName, rc.CityName AS RespondentCityName,
            fs.StateName AS FirmStateName, fc.CityName AS FirmCityName
     FROM tbl_NewComplaint nc
     LEFT JOIN tbl_StateMaster cs ON nc.StateID = cs.StateID
     LEFT JOIN tbl_CityMaster cc ON nc.CityID = cc.CityID
     LEFT JOIN tbl_StateMaster rs ON nc.RStateID = rs.StateID
     LEFT JOIN tbl_CityMaster rc ON nc.RCityID = rc.CityID
     LEFT JOIN tbl_StateMaster fs ON nc.FirmProfStateID = fs.StateID
     LEFT JOIN tbl_CityMaster fc ON nc.FirmProfCityID = fc.CityID
     WHERE nc.CompID = @id`,
    { id: compId }
  );
  if (!rows.length) return null;

  const answerable = await query(
    `SELECT MemName, MemEmailID FROM tbl_AnswerableMember
     WHERE CompID=@id AND MemEmailID IS NOT NULL AND LTRIM(RTRIM(MemEmailID))<>''
     ORDER BY AMemID`,
    { id: compId }
  );
  const ws = await query(
    `SELECT TOP 1 StatusDate FROM tbl_ComplaintStatus
     WHERE CompaintID=@id AND StatusID=16 ORDER BY CompStatusID DESC`,
    { id: compId }
  );
  return {
    row: rows[0],
    answerableEmails: answerable.map((r) => clean(r.MemEmailID)).filter(Boolean),
    wsDate: ws.length ? ws[0].StatusDate : null,
  };
}

function makeRenderer(doc, font, boldFont) {
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ensure = (needed) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  const text = (value, opts = {}) => {
    const content = value == null ? '' : String(value);
    if (!content) return;
    const size = opts.size || 10;
    const leading = opts.leading || size + 3;
    const f = opts.bold ? boldFont : font;
    const color = opts.color || rgb(0, 0, 0);
    const indent = opts.indent || 0;
    const maxWidth = opts.maxWidth || MAX_WIDTH - indent;
    const lines = opts.center ? [content] : wrapText(content, f, size, maxWidth);
    for (const line of lines) {
      ensure(leading);
      const width = f.widthOfTextAtSize(line, size);
      const x = opts.center ? (PAGE_WIDTH - width) / 2 : MARGIN + (opts.xOffset || 0) + indent;
      page.drawText(line, { x, y, size, font: f, color });
      y -= opts.center ? leading : leading;
    }
    if (opts.spaceAfter) y -= opts.spaceAfter;
  };

  return { text, get y() { return y; }, set y(v) { y = v; } };
}

function wrapText(value, font, size, maxWidth) {
  const words = String(value).split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function addHeading(r) {
  r.text('CONFIDENTIAL', { bold: true, size: 11, center: true, spaceAfter: 4 });
  r.text('SPEED POST A.D.', { bold: true, size: 10, center: true, spaceAfter: 14 });
}

function signatureBlock(r) {
  r.text('', { spaceAfter: 18 });
  r.text('Yours faithfully,', { spaceAfter: 18 });
  r.text('NEELAM PUNDIR', { bold: true });
  r.text('Sr. EXECUTIVE OFFICER', { bold: true });
  r.text('Disciplinary Directorate');
  r.text('Phone no.: 0120-6540233');
  r.text('Email: disccomp@icai.in');
  r.text('', { spaceAfter: 6 });
  r.text('Encl: as above', { size: 9 });
}

function commonPs(r) {
  r.text('', { spaceAfter: 4 });
  r.text('PS.:  * In addition, you are also requested to submit the same in MS Word format through email along with the hard copy.', { size: 8 });
  r.text('** Further, a consolidated duly signed reply alongwith relevant annexures properly indexed and serially numbered should be sent all at once.', { size: 8 });
}

function copyToComplainant(r, ctx, notes = []) {
  const row = ctx.row;
  r.text('Copy to:', { bold: true, spaceAfter: 3 });
  r.text(`${clean(row.Name) || 'Complainant'}`);
  if (row.Address) r.text(clean(row.Address));
  if (row.Area) r.text(clean(row.Area));
  const place = cityState(row.ComplainantCityName, row.ComplainantStateName, row.Pincode);
  if (place) r.text(place);
  if (row.MobileNo) r.text(`Phone no. ${clean(row.MobileNo)}`);
  r.text('', { spaceAfter: 8 });
  r.text('For information', { bold: true, spaceAfter: 3 });
  for (const note of notes) r.text(note, { size: 8 });
}

async function makeMemberWsLetter(ctx) {
  const row = ctx.row;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const r = makeRenderer(doc, font, bold);

  addHeading(r);
  r.text(`Ref. No. ${clean(row.CompNo) || ''}`, { spaceAfter: 14 });
  r.text(clean(row.ResName) || 'Respondent');
  if (row.ResProfAddress) r.text(clean(row.ResProfAddress));
  if (row.ResCommAddress) r.text(clean(row.ResCommAddress));
  const resPlace = cityState(ctx.respondentCity, ctx.respondentState, '');
  if (resPlace) r.text(resPlace);
  if (row.ResMobileNo) r.text(`Phone no. ${clean(row.ResMobileNo)}`);
  r.text('', { spaceAfter: 10 });
  r.text('Dear Sir,', { spaceAfter: 12 });

  const complaintDate = fmtDate(row.EntryDate);
  r.text(`Sub: In the matter of complaint made by ${clean(row.Name) || 'the complainant'}, ${cityState(ctx.complainantCity, ctx.complainantState, '')}, against you, under Section 21 of the Chartered Accountants Act, 1949.`, { bold: true, spaceAfter: 10 });
  r.text(`In accordance with the provisions of Rule 8(1)(a) of the Chartered Accountants (Procedure of Investigations of Professional and Other Misconduct and Conduct of Cases) Rules, 2007 (hereinafter referred to as the "said Rules"), we are sending herewith a copy of the complaint dated ${complaintDate} made by ${clean(row.Name) || 'the complainant'}, ${cityState(ctx.complainantCity, ctx.complainantState, '')}, against you. A copy of the said Rules is enclosed herewith for your ready reference.`, { spaceAfter: 10 });
  r.text('You are requested to send the Written Statement, if any, duly signed (in original) by you in triplicate, within 21 days of receipt of this letter.', { spaceAfter: 10 });
  r.text('Please note that in case no reply is received within a period of 21 days as specified above, it shall be presumed that you have nothing further to state and accordingly the complaint will be processed further in accordance with the provisions of the aforesaid Rules without making any further reference to you.', { spaceAfter: 12 });
  signatureBlock(r);
  commonPs(r);
  copyToComplainant(r, ctx, [
    'PS.:  * No additional documents will be accepted, unless called for by this Directorate.',
    '** Since expansion of charges is not allowed under the Rules, no additional allegations will be entertained as the complaint has already been registered.',
  ]);
  return doc.save();
}

async function makeFirmWsLetter(ctx) {
  const row = ctx.row;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const r = makeRenderer(doc, font, bold);

  addHeading(r);
  r.text(`Ref. No. ${clean(row.CompNo) || ''}`, { spaceAfter: 14 });
  r.text(`M/s ${clean(row.NameofFirm) || clean(row.ResName) || 'Firm'}`, { bold: true });
  if (row.FirmProfAddress) r.text(clean(row.FirmProfAddress));
  if (row.FirmCommAddress) r.text(clean(row.FirmCommAddress));
  const firmPlace = cityState(ctx.firmCity, ctx.firmState, '');
  if (firmPlace) r.text(firmPlace);
  if (row.ResMobileNo) r.text(`Phone no. ${clean(row.ResMobileNo)}`);
  r.text('', { spaceAfter: 10 });
  r.text('Dear Sirs,', { spaceAfter: 12 });

  const complaintDate = fmtDate(row.EntryDate);
  r.text(`Sub: In the matter of complaint made by ${clean(row.Name) || 'the complainant'}, ${cityState(ctx.complainantCity, ctx.complainantState, '')}, against you, under Section 21 of the Chartered Accountants Act, 1949.`, { bold: true, spaceAfter: 10 });
  r.text(`In accordance with the provisions of clause (b) of sub-rule (1) of Rule 8 of the Chartered Accountants (Procedure of Investigations of Professional and Other Misconduct and Conduct of Cases) Rules, 2007 (hereinafter referred to as the "Rules"), we are sending herewith a copy of the complaint dated ${complaintDate} made by ${clean(row.Name) || 'the complainant'}, ${cityState(ctx.complainantCity, ctx.complainantState, '')}, against you. A copy of the said Rules is enclosed herewith for your ready reference.`, { spaceAfter: 10 });
  r.text('The requirements to be complied with and the consequences of non-compliance thereof in the case of complaints filed against firms, as provided under the said Rules, are reproduced herein below for your ready reference:', { spaceAfter: 8 });
  r.text('"8(1)(b) if the complaint is against a firm, send particulars of the acts of commission or omission alleged or a copy of the complaint, as the case may be, to the firm at the address of its head office, as entered last in the Register of Offices and Firms maintained by the Institute, with a notice calling upon the firm to disclose the name or names of the member or members concerned and to send particulars of acts of commission or omission or a copy of the complaint, as the case may be, to such members:', { size: 9, indent: 18, spaceAfter: 6 });
  r.text('Provided that while disclosing the name or names of the member or members, the firm shall also send a declaration signed or, as the case may be, jointly signed by the member or members concerned to the effect that he or she or they shall be responsible for answering the complaint and that the particulars of acts of commission or omission or the copy of the complaint sent to the firm by the Director had been duly received by him, her or them.', { size: 9, indent: 18, spaceAfter: 6 });
  r.text('(2) A member whose name is disclosed by the firm shall be responsible for answering the complaint, provided such a member was associated, either as partner or employee, with the firm against which the complaint has been filed, at the time of occurrence of the alleged misconduct.', { size: 9, indent: 18, spaceAfter: 6 });
  r.text('(3) A member who has been informed of the complaint filed against him (hereinafter referred to as the respondent) shall, within 21 days of the service of a copy of the complaint, or within such additional time, not exceeding thirty days, as may be allowed by the Director, forward to the Director, a written statement in his defense."', { size: 9, indent: 18, spaceAfter: 10 });
  r.text('In terms of the above, you are requested to disclose the name/s of the member/s who is/are answerable to the complaint and send a copy of this letter with its enclosures to the said member/s. While sending the copy of the complaint to such member/s, he/she/they be requested to send the written statement, if any, duly signed (in original) by him/her/them in triplicate, directly to us within 21 days of receipt of this letter by the aforesaid member/s.', { spaceAfter: 10 });
  r.text('A separate communication be sent to Director (Discipline), Disciplinary Directorate of the Institute disclosing the name(s) of the member(s) answerable to the complaint along with a declaration in the enclosed format duly signed by the member/s answerable to the complaint.', { spaceAfter: 10 });
  r.text('It may be noted that in the event of non-receipt of your Written Statement within a period of 21 days as specified above, it shall be presumed that you have nothing further to state and the complaint will be processed in accordance with the provisions of the aforesaid Rules without any further reference to you.', { spaceAfter: 12 });
  signatureBlock(r);
  r.text('PS.:  * In addition, you may also submit a soft copy of your Written Statement through email alongwith the hard copy.', { size: 8 });
  r.text('** Further, a consolidated duly signed reply alongwith relevant annexures properly indexed and serially numbered should be sent all at once.', { size: 8 });
  copyToComplainant(r, ctx, [
    'PS.:  * No additional documents will be accepted, unless called for by this Directorate.',
    '** Since expansion of charges is not allowed under the Rules, no additional allegations will be entertained as the complaint has already been registered.',
  ]);
  return doc.save();
}

async function makeRejoinderLetter(ctx) {
  const row = ctx.row;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const r = makeRenderer(doc, font, bold);

  addHeading(r);
  r.text(`Ref. No. ${clean(row.CompNo) || ''}`, { spaceAfter: 14 });
  r.text(clean(row.Name) || 'Complainant');
  if (row.Address) r.text(clean(row.Address));
  if (row.Area) r.text(clean(row.Area));
  const place = cityState(ctx.complainantCity, ctx.complainantState, row.Pincode);
  if (place) r.text(place);
  if (row.MobileNo) r.text(`Phone no. ${clean(row.MobileNo)}`);
  r.text('', { spaceAfter: 10 });
  r.text('Dear Sir,', { spaceAfter: 12 });

  const respondent = [clean(row.ResName) || 'the respondent', ctx.respondentCity].filter(Boolean).join(', ');
  const wsDate = fmtDate(ctx.wsDate) || fmtDate(new Date());
  r.text(`Sub: In the matter of complaint made by you against ${respondent}, under Section 21 of the Chartered Accountants Act, 1949.`, { bold: true, spaceAfter: 10 });
  r.text(`In accordance with the provisions of Rule 8(4) of the Chartered Accountants (Procedure of Investigations of Professional and Other Misconduct and Conduct of Cases) Rules, 2007 (hereinafter referred to as the "said Rules"), we are sending herewith copy of the written statement dated ${wsDate} submitted by ${respondent}. A copy of the said Rules is enclosed herewith for your ready reference.`, { spaceAfter: 10 });
  r.text('You are requested to send the Rejoinder, if any, duly signed by you, in duplicate, within 21 days of receipt of this letter.', { spaceAfter: 10 });
  r.text('Please note that in case no rejoinder is received within the period as specified above, it shall be presumed that you have nothing further to state and accordingly the complaint will be processed in accordance with the provisions of the aforesaid Rules, without making any further reference to you.', { spaceAfter: 12 });
  r.text('Yours faithfully,', { spaceAfter: 18 });
  r.text('NEELAM PUNDIR', { bold: true });
  r.text('Sr. EXECUTIVE OFFICER', { bold: true });
  r.text('Disciplinary Directorate');
  r.text('Phone: (011) 30210618');
  r.text('Email: neelam.pundir@icai.in');
  r.text('', { spaceAfter: 6 });
  r.text('Encl. as above', { size: 9 });
  r.text('PS.:  * In addition, you are also requested to submit the same in MS Word format through email along with the hard copy.', { size: 8 });
  return doc.save();
}

function withNames(ctx) {
  const row = ctx.row;
  return {
    ...ctx,
    complainantCity: clean(row.ComplainantCityName),
    complainantState: clean(row.ComplainantStateName),
    respondentCity: clean(row.RespondentCityName || row.RCityname),
    respondentState: clean(row.RespondentStateName),
    firmCity: clean(row.FirmCityName || row.RCityname),
    firmState: clean(row.FirmStateName || row.RStateName),
  };
}

async function generateWsLetterPdf(compId) {
  const ctx = await loadLetterContext(compId);
  if (!ctx) throw new Error('Complaint not found for letter generation');
  const enriched = withNames(ctx);
  const isFirm = Number(enriched.row.IsFirm) === 1;
  const buffer = isFirm ? await makeFirmWsLetter(enriched) : await makeMemberWsLetter(enriched);
  const recipients = Array.from(
    new Set(
      [clean(enriched.row.ResEmailID), ...(isFirm ? enriched.answerableEmails : [])]
        .map((e) => e.toLowerCase())
        .filter(Boolean)
    )
  );
  return {
    buffer: Buffer.from(buffer),
    isFirm,
    toEmail: recipients.join(','),
    compNo: clean(enriched.row.CompNo),
    complainantEmail: clean(enriched.row.EmailID),
  };
}

async function generateRejoinderLetterPdf(compId) {
  const ctx = await loadLetterContext(compId);
  if (!ctx) throw new Error('Complaint not found for letter generation');
  const enriched = withNames(ctx);
  const buffer = await makeRejoinderLetter(enriched);
  return {
    buffer: Buffer.from(buffer),
    toEmail: clean(enriched.row.EmailID),
    compNo: clean(enriched.row.CompNo),
  };
}

async function saveGeneratedLetter(buffer, prefix) {
  const filename = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
  const folder = 'Workflow';
  if (process.env.VERCEL || process.env.BLOB_READ_WRITE_TOKEN) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error('BLOB_READ_WRITE_TOKEN missing; cannot store generated letter');
    }
    await put(`${folder}/${filename}`, buffer, {
      access: 'public',
      contentType: 'application/pdf',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return filename;
  }
  const dir = path.join(DOC_ROOT, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), buffer);
  return filename;
}

module.exports = {
  generateWsLetterPdf,
  generateRejoinderLetterPdf,
  saveGeneratedLetter,
};
