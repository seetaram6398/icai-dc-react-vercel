const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { query } = require('../config/db');
const { resolveDocumentPath } = require('./documents');
const { statusText } = require('../utils/statusText');
const A4 = [595.28, 841.89];
const M = 45;
const CW = A4[0] - M * 2;

const NAVY = rgb(0.13, 0.21, 0.31);
const DARK = rgb(0.15, 0.18, 0.22);
const GRAY = rgb(0.45, 0.45, 0.45);
const WHITE = rgb(1, 1, 1);
const LINE = rgb(0.6, 0.6, 0.6);

const PAY_MODE_LABELS = { 2: 'NEFT', 3: 'Net Banking', 4: 'DD' };
const IMAGE_EXT = ['png', 'jpg', 'jpeg'];
const PAD = 5;

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

const sanitize = (v) => {
  if (v === null || v === undefined || v === '') return '';
  return String(v);
};

const fmtD = (v) => (v ? new Date(v).toLocaleDateString('en-GB') : '');

function band(page, y, h, color) {
  page.drawRectangle({ x: 0, y: y - h, width: A4[0], height: h, color: color || NAVY });
}

function scaleToFit(imgWidth, imgHeight, maxW, maxH) {
  const scale = Math.min(maxW / imgWidth, maxH / imgHeight, 1);
  return { w: imgWidth * scale, h: imgHeight * scale };
}

/**
 * Build the merged PDF for one complaint:
 *   - The official APPENDIX-I / Form A template (Rule 3(1)) reproduced with the
 *     same bordered-table structure as the legacy ASPX ComplaintForm.html.
 *   - Every uploaded document appended, with the document's name printed
 *     at the top of each of its pages.
 * Footer "Page i of N" is stamped on every page.
 */
async function buildComplaintPdf(id, opts) {
  const includeHistory = !!(opts && opts.includeHistory);
  const rows = await query(
    `SELECT nc.*, sm.StatusName, ct.CompTypeName, pm.PaymentModeName,
            u.NameOfTheUser AS ComplainantName, u.Email AS ComplainantEmail, u.Mob AS ComplainantMobile,
            u.MembershipNo AS CompMembershipNo, u.Address AS ComplainantAddress, u.Area AS ComplainantArea,
            u.Landmark AS ComplainantLandmark, u.City AS ComplainantCity, u.Pincode AS ComplainantPincode,
            u.CountryCode AS ComplainantCountryCode, u.STDCode AS ComplainantSTDCode, u.LandlineNo AS ComplainantLandline,
            sc.StateName AS CompStateName, cc.CityName AS CompCityName,
            sr.StateName AS ResStateName, cr.CityName AS ResCityName
     FROM tbl_NewComplaint nc
     LEFT JOIN tbl_StatusMaster sm ON nc.StatusID = sm.StatusID
     LEFT JOIN tbl_CompType ct ON nc.CompType = ct.CompTypeID
     LEFT JOIN tbl_PaymentMode pm ON nc.PaymentMode = pm.PaymentModeID
     LEFT JOIN tbl_Users u ON nc.UserID = u.UserID
     LEFT JOIN tbl_StateMaster sc ON nc.StateID = sc.StateID
     LEFT JOIN tbl_CityMaster cc ON nc.CityID = cc.CityID
     LEFT JOIN tbl_StateMaster sr ON nc.RStateID = sr.StateID
     LEFT JOIN tbl_CityMaster cr ON nc.RCityID = cr.CityID
     WHERE nc.CompID=@id`,
    { id }
  );
  if (rows.length === 0) return null;
  const c = rows[0];

  const factPersons = await query('SELECT * FROM tbl_FactPersons WHERE CompID=@id', { id });
  const answerable = await query('SELECT * FROM tbl_AnswerableMember WHERE CompID=@id', { id });
  const schedules = await query(
    `SELECT ScheduleName, PartNo, ItemName, Miscondate, MisconductDate, MisconductDateTo
     FROM vw_ScheduleList WHERE CompID=@id`,
    { id }
  );
  const docs = await query('SELECT CompAttachID, DocumentID, DocURL FROM tbl_ComplaintDocument WHERE CompID=@id', { id });
  const av = await query('SELECT AttachID, Attachment FROM tbl_AudioVideoAttachment WHERE ComplaintID=@id', { id });
  let history = [];
  if (includeHistory) {
    history = await query(
      `SELECT cs.StatusDate, cs.StatusID, cs.Remarks, cs.Attachment, cs.CommonField, cs.ExtensionTime,
              sm.StatusName, u.NameOfTheUser AS ByUserName
       FROM tbl_ComplaintStatus cs
       INNER JOIN tbl_StatusMaster sm ON cs.StatusID = sm.StatusID
       LEFT JOIN tbl_Users u ON cs.UserID = u.UserID
       WHERE cs.CompaintID=@id ORDER BY cs.CompStatusID`,
      { id }
    );
  }

  const paths = [];
  docs.forEach((r) => paths.push(r.DocURL));
  av.forEach((r) => paths.push(r.Attachment));
  [c.BriefAttachment, c.MisconductAttachment, c.RegulatorAttachment, c.InvestigatingReport,
    c.AadharPhoto, c.ComplaintantPhoto, c.ComplaintantSignature].forEach((p) => { if (p) paths.push(p); });
  const files = [...new Set(paths.filter(Boolean).map((p) => p.replace(/\\/g, '/')))];
  const attach = files
    .map((rel) => {
      const resolved = resolveDocumentPath(rel);
      return resolved ? { rel, abs: resolved.abs } : null;
    })
    .filter(Boolean);

  const doc = await PDFDocument.create();
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontR = await doc.embedFont(StandardFonts.Helvetica);

  // ---- Embed form images (photo, PAN/Aadhar, signature) ----
  const readImage = async (value, kind) => {
    const resolved = value ? resolveDocumentPath(String(value).replace(/\\/g, '/')) : null;
    if (!resolved) return null;
    const ext = String(resolved.abs).split('.').pop().toLowerCase();
    if (!IMAGE_EXT.includes(ext)) return null;
    try {
      const bytes = fs.readFileSync(resolved.abs);
      const img = ext === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      return { obj: img, w: img.width, h: img.height, kind };
    } catch (e) {
      return null;
    }
  };
  const [photoImg, aadharImg, signImg] = await Promise.all([
    readImage(c.ComplaintantPhoto, 'photo'),
    readImage(c.AadharPhoto, 'aadhar'),
    readImage(c.ComplaintantSignature, 'sign'),
  ]);

  let page = doc.addPage(A4);
  let y = A4[1] - M;

  function ensureSpace(needed) {
    if (y - needed < M) {
      page = doc.addPage(A4);
      y = A4[1] - M;
    }
  }

  // ======================================================================
  // Table engine - mirrors ComplaintForm.html (bordered 3-column layout)
  // ======================================================================
  const COLS = [CW * 0.06, CW * 0.43, CW * 0.51]; // 6% | 43% | 51%
  const detail = (v) => sanitize(v) || '—';

  // Prepare a simple text cell (wrapped at build time).
  function tcell(w, text, opts) {
    const o = opts || {};
    const size = o.size || 8.5;
    const font = o.bold ? fontB : fontR;
    const lines = wrapLines(font, size, text == null ? '' : String(text), Math.max(4, w - 2 * PAD));
    const h = Math.max(14, lines.length * (size + 1.5) + 2 * PAD);
    return { w, size, font, bold: !!o.bold, italic: !!o.italic, color: o.color || DARK, lines, h, align: o.align || 'l' };
  }

  // Image cell (single image or two side-by-side images).
  function icell(w, images, maxW, maxH) {
    const imgs = (images || []).filter(Boolean).map((im) => {
      const s = scaleToFit(im.w, im.h, maxW, maxH);
      return { ...im, ...s };
    });
    const h = imgs.length ? Math.max(...imgs.map((i) => i.h)) + 2 * PAD : 16;
    return { w, images: imgs, h };
  }

  // Nested bordered table cell.
  function ncell(w, colWs, dataRows) {
    const rowsLike = dataRows.map((r) => {
      const span = r.length === 1;
      const filled = span ? [r[0], ...colWs.slice(1).map(() => '')] : r;
      return {
        span,
        cells: filled.map((cellV, ci) => {
          const size = 8;
          const font = fontR;
          const cellW = span ? colWs.reduce((a, b) => a + b, 0) : colWs[ci];
          const lines = wrapLines(font, size, cellV == null ? '' : String(cellV), Math.max(4, cellW - 2 * PAD));
          return { size, font, lines };
        }),
      };
    });
    const rowHs = rowsLike.map((r) =>
      Math.max(...r.cells.map((cellV, i) => Math.max(12, cellV.lines.length * (cellV.size + 1.5) + 2 * PAD)))
    );
    const total = rowHs.reduce((a, b) => a + b, 0) + 2 * PAD;
    return { w, nested: { colWs, rowsLike, rowHs }, h: total };
  }

  // Row = { cells, span? } -> compute canvas height and draw.
  function drawCellBox(x, yTop, w, h, cell) {
    page.drawRectangle({ x, y: yTop - h, width: w, height: h, borderColor: LINE, borderWidth: 0.6 });
    if (cell.images) {
      const totalW = cell.images.reduce((a, im) => a + im.w, 0) + Math.max(0, cell.images.length - 1) * 6;
      let ix = x + Math.max((w - totalW) / 2, PAD);
      const top = yTop - PAD;
      cell.images.forEach((im) => {
        page.drawImage(im.obj, { x: ix, y: top - im.h, width: im.w, height: im.h });
        ix += im.w + 6;
      });
      return;
    }
    if (cell.nested) {
      const n = cell.nested;
      let yy = yTop - PAD;
      n.rowsLike.forEach((r, ri) => {
        let cx = x + PAD;
        const rowH = n.rowHs[ri];
        if (r.span) {
          const wAll = n.colWs.reduce((a, b) => a + b, 0);
          page.drawRectangle({ x: cx, y: yy - rowH, width: wAll, height: rowH, borderWidth: 0.5, borderColor: LINE });
          r.cells[0].lines.forEach((ln, li) => {
            page.drawText(ln, { x: cx + 3, y: yy - PAD - 8 - li * 9.5, size: 8, font: fontR, color: DARK });
          });
          yy -= rowH;
          return;
        }
        r.cells.forEach((cv, ci) => {
          page.drawRectangle({ x: cx, y: yy - rowH, width: n.colWs[ci], height: rowH, borderWidth: 0.5, borderColor: LINE });
          cv.lines.forEach((ln, li) => {
            page.drawText(ln, { x: cx + 3, y: yy - PAD - cv.size - li * (cv.size + 1.5), size: cv.size, font: cv.font, color: DARK });
          });
          cx += n.colWs[ci];
        });
        yy -= rowH;
      });
      return;
    }
    const lines = cell.lines || [];
    if (!lines.length) return;
    lines.forEach((ln, i) => {
      const textW = cell.font.widthOfTextAtSize(ln, cell.size);
      const tx = cell.align === 'c' ? x + (w - textW) / 2 : x + PAD;
      page.drawText(ln, { x: tx, y: yTop - PAD - cell.size - i * (cell.size + 1.5), size: cell.size, font: cell.font, color: cell.color });
    });
  }

  function rowHeight(cells) {
    return Math.max(...cells.map((c) => c.h));
  }

  function renderRows(rowsArr) {
    for (const r of rowsArr) {
      const finalH = rowHeight(r.cells);
      ensureSpace(finalH + 2);
      let x = M;
      let drawn = 0;
      r.cells.forEach((c, i) => {
        const isLast = i === r.cells.length - 1;
        const w = isLast ? CW - drawn : c.w;
        drawCellBox(x, y, w, finalH, c);
        x += w;
        drawn += w;
      });
      y -= finalH;
    }
  }

  function headingRow(num, label) {
    renderRows([
      {
        cells: [num ? tcell(COLS[0], num, { bold: true }) : tcell(COLS[0], ''), tcell(COLS[1] + COLS[2], label, { bold: true })],
      },
    ]);
  }

  function historyTable(history) {
    const widths = [CW * 0.08, CW * 0.16, CW * 0.2, CW * 0.3, CW * 0.14, CW * 0.12];
    const rowsList = [
      {
        cells: widths.map((w, i) =>
          tcell(w, ['S.No', 'Date', 'Status', 'Remarks', 'File', 'By'][i], { bold: true })
        ),
      },
    ];
    history.forEach((h, i) => {
      rowsList.push({
        cells: [
          tcell(widths[0], String(i + 1)),
          tcell(widths[1], fmtD(h.StatusDate)),
          tcell(widths[2], statusText(String(h.StatusName || '')) || String(h.StatusName || '—')),
          tcell(widths[3], String(h.Remarks || '—')),
          tcell(widths[4], h.Attachment ? String(h.Attachment).split(/[\\/]/).pop() : '—'),
          tcell(widths[5], String(h.ByUserName || '—')),
        ],
      });
    });
    if (!history.length) rowsList.push({ cells: [tcell(CW, 'No status recorded.', {})] });
    renderRows(rowsList);
  }

  // ======================================================================
  // Form A - data preparation
  // ======================================================================
  const isGovType = ['Central Goverment', 'State Goverment', 'Regulatory Agency'].includes(String(c.CompTypeName || '').trim());
  const isIndividual = String(c.CompTypeName || '').trim().toLowerCase() === 'individual';
  const isFirm = Number(c.IsFirm) === 1;

  const compAddressLines = [c.Address, c.Area, c.Landmark].filter((v) => sanitize(v));
  const compAddressFull = compAddressLines.join('\n');
  const compStateCity = [c.CompStateName, c.CompCityName].filter((v) => sanitize(v)).join(', ');
  const compPin = detail(c.Pincode);
  const mrn = sanitize(c.CompMembershipNo);

  const resNameCaption = isFirm ? 'Full Name of the Firm' : 'Full Name of the Member';
  const regMemNoCaption = isFirm ? 'Firm Registration number' : 'Membership Number';

  // ----- Nested tables -----
  const answerableRows = answerable.map((m, i) => [i + 1, sanitize(m.MemName), sanitize(m.MemMobileNo), sanitize(m.MemEmailID)]);
  const ansCols = ncell(COLS[2], [COLS[2] * 0.1, COLS[2] * 0.38, COLS[2] * 0.2, COLS[2] * 0.32], answerableRows.length ? answerableRows : [['No members answerable.']]);

  const scheduleRows = schedules.map((s, i) => [i + 1, sanitize(s.ScheduleName), sanitize(s.PartNo), sanitize(s.ItemName)]);
  const schCols = ncell(COLS[2], [COLS[2] * 0.1, COLS[2] * 0.34, COLS[2] * 0.16, COLS[2] * 0.4], scheduleRows.length ? scheduleRows : [['No schedule selected.']]);

  const dateRows = schedules.map((s, i) => [i + 1, s.MisconductDate ? fmtD(s.MisconductDate) : '—', s.MisconductDateTo ? fmtD(s.MisconductDateTo) : '—']);
  const dateCols = ncell(COLS[2], [COLS[2] * 0.12, COLS[2] * 0.42, COLS[2] * 0.46], dateRows.length ? dateRows : [['No dates recorded.']]);

  const personRows = factPersons.map((p, i) => [i + 1, sanitize(p.PersonName), sanitize(p.PersonMobile), sanitize(p.PersonEmail)]);
  const personCols = ncell(COLS[2], [COLS[2] * 0.1, COLS[2] * 0.38, COLS[2] * 0.2, COLS[2] * 0.32], personRows.length ? personRows : [['No person(s) recorded.']]);

  const evidenceLines = docs.length
    ? docs.map((d, i) => `${['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][i] || `${i + 1}.`}  ${sanitize(d.DocumentID) || sanitize(d.DocURL).split('/').pop()}  (View Document ${sanitize(d.DocURL).split('/').pop()})`)
    : [];

  const formRowsStart = [
    // ----- Header (Appendix I) -----
    { cells: [tcell(CW, 'APPENDIX – I', { bold: true, size: 13, align: 'c' })], h: 24 },
    { cells: [tcell(CW, `Form ${sanitize(c.FormType) || 'A'}`, { bold: true, size: 13, align: 'c' })], h: 22 },
    { cells: [tcell(CW, '[See Rule 3 (1)]', { italic: true, size: 10.5, align: 'c' })], h: 20 },
    { cells: [tcell(CW, 'Form for Filing a Complaint under Section 21', { bold: true, size: 11.5, align: 'c' })], h: 24 },
    { cells: [tcell(CW, `Complaint No. : ${detail(c.CompNo)}`, { bold: true, size: 10, align: 'c', color: NAVY })], h: 22 },
  ];

  const formRowsBody = [
    // 1. Particulars of the Complainant
    { cells: [tcell(COLS[0], '1.', { bold: true }), tcell(COLS[1] + COLS[2], 'Particulars of the Complainant', { bold: true })] },
    { cells: [
      tcell(COLS[0], '(a)(*)'),
      tcell(COLS[1], 'Full Name:\nIf the Complainant is a Member of the Institute of the Chartered Accountants of India, specify MRN;\nIf the Complainant is a Firm registered with the Institute of the Chartered Accountants of India, specify FRN and attach a certified copy of authorization by the partners/ Managing partner, if he is empowered;\nIf the Complainant is a Firm other than a CA firm, specify Firm Registration number, if any and attach a certified copy of authorization by the partners/ Managing partner, if he is empowered;\nIf the Complainant is a Company registered under the Companies Act, specify CIN and attach a certified copy of Board resolution;\nIf the Complainant is a Government Department, Government Agency, Statutory Authority, attach the authorization in terms of Rule -----\nIf the Complainant is any other entity, specify Registration number of the entity, if any. Attach a certified copy of resolution of such governing body or managing committee of such entity;', { size: 7.5 }),
      tcell(COLS[2], [detail(c.Name), mrn ? `(MRN: ${mrn})` : '', c.RegulatorAttachment ? 'View Letter of Authority' : ''].filter(Boolean).join('\n'), { bold: true }),
    ]},
    { cells: [
      tcell(COLS[0], '(b)(*)'),
      tcell(COLS[1], 'Address'),
      tcell(COLS[2], `${compAddressFull ? `${compAddressFull}\n` : ''}${compStateCity ? `${compStateCity}\n` : ''}PIN: ${compPin}`),
    ]},
    { cells: [
      tcell(COLS[0], '(c)(*)'),
      tcell(COLS[1], 'Address for Communication'),
      tcell(COLS[2], `${compAddressFull ? `${compAddressFull}\n` : ''}${compStateCity ? `${compStateCity}\n` : ''}PIN : ${compPin}`),
    ]},
    { cells: [
      tcell(COLS[0], '(d)(*)'),
      tcell(COLS[1], 'Mobile Number (with Country Code) and / or Landline Number (STD Code)'),
      tcell(COLS[2], `${detail(c.CountryCode)} ${detail(c.MobileNo)} / (${detail(c.STDCode)}) ${detail(c.LandLineNo)}`),
    ]},
    { cells: [
      tcell(COLS[0], '(e)'),
      tcell(COLS[1], 'E-mail Id'),
      tcell(COLS[2], detail(c.EmailID)),
    ]},
    { cells: [
      tcell(COLS[0], '(f)(*)'),
      tcell(COLS[1], 'Photo Identity & Address Proof (along with ID number)\n(Please attach a self-attested copy of either of Aadhar card or Voter ID card or Passport or any document issued by Central or State Government)'),
      icell(COLS[2], [photoImg, aadharImg], 96, 100),
    ]},

    // 2. Particulars of the Respondent
    { cells: [tcell(COLS[0], '2', { bold: true }), tcell(COLS[1] + COLS[2], 'Particulars of the Respondent', { bold: true })] },
    { cells: [
      tcell(COLS[0], '(a)(*)'),
      tcell(COLS[1], resNameCaption),
      tcell(COLS[2], detail(c.ResName)),
    ]},
    { cells: [
      tcell(COLS[0], '(b)'),
      tcell(COLS[1], regMemNoCaption),
      tcell(COLS[2], `${detail(isFirm ? c.FirmNo : c.ResRegistrationNo)}${isFirm ? ` ${detail(c.ResRegistrationNo)}` : ''}`),
    ]},
    { cells: [
      tcell(COLS[0], '(c)'),
      tcell(COLS[1], 'Professional Address'),
      tcell(COLS[2], detail(c.ResProfAddress)),
    ]},
    { cells: [
      tcell(COLS[0], '(d)(*)'),
      tcell(COLS[1], 'Address for Communication'),
      tcell(COLS[2], detail(c.ResCommAddress)),
    ]},
    { cells: [
      tcell(COLS[0], '(e)'),
      tcell(COLS[1], 'Mobile Number with Country code and / or Landline Number with STD Code'),
      tcell(COLS[2], `${detail(c.ResCountryCode)} ${detail(c.ResMobileNo)} / (${detail(c.ResSTDCode)}) ${detail(c.ResLandlineNo)}`),
    ]},
    { cells: [
      tcell(COLS[0], '(f)'),
      tcell(COLS[1], 'E-mail Id'),
      tcell(COLS[2], detail(c.ResEmailID)),
    ]},

    // 3. Members Answerable
    { cells: [tcell(COLS[0], '3', { bold: true }), tcell(COLS[1], 'Members Answerable', { bold: true }), ansCols] },

    // 4. Particulars of Complaint
    { cells: [tcell(COLS[0], '4', { bold: true }), tcell(COLS[1] + COLS[2], 'Particulars of Complaint', { bold: true })] },
    { cells: [
      tcell(COLS[0], '(a)(*)'),
      tcell(COLS[1], 'Brief Statement of facts'),
      tcell(COLS[2], `${detail(c.BriefStatement)}${c.BriefAttachment ? `\nView Document (${String(c.BriefAttachment).split(/[\\/]/).pop()})` : ''}`),
    ]},
    { cells: [
      tcell(COLS[0], '(b)(*)'),
      tcell(COLS[1], 'Particulars of the alleged Professional or other misconduct'),
      tcell(COLS[2], `${detail(c.ParticularMisconduct)}${c.MisconductAttachment ? `\nView Document (${String(c.MisconductAttachment).split(/[\\/]/).pop()})` : ''}`),
    ]},
    { cells: [
      tcell(COLS[0], '(c)'),
      tcell(COLS[1], 'Specify relevant Item number(s), Part number(s) and Schedule number(s) of the Act under which the allegations are made'),
      schCols,
    ]},

    // 5. Index of evidences
    { cells: [
      tcell(COLS[0], '5(*)'),
      tcell(COLS[1], 'An index enlisting all documentary evidences attached along with the Complaint in support of each of the alleged professional or other misconduct;'),
      tcell(COLS[2], evidenceLines.length ? evidenceLines.join('\n') : '—'),
    ]},

    // 6. Relevant dates
    { cells: [
      tcell(COLS[0], '6(*)'),
      tcell(COLS[1], 'Relevant dates and period of occurrence of alleged misconduct'),
      dateCols,
    ]},

    // 7. Complaint fee
    { cells: [
      tcell(COLS[0], '7(*)'),
      tcell(COLS[1], 'Particulars of the Complaint fee - Mode of Payment, DD No. and date or online transaction number, Date of payment'),
      tcell(COLS[2], isGovType
        ? 'Exempt'
        : `Mode - ${detail(PAY_MODE_LABELS[c.PaymentMode] || c.PaymentModeName || c.PaymentMode)}\nDate - ${fmtD(c.PaymentDate) || '—'}\nRef No. - ${detail(c.TransRefNo)}${c.PaymentDetails ? `\n${c.PaymentDetails}` : ''}`),
    ]},

    // 8. Persons with knowledge
    { cells: [
      tcell(COLS[0], '8. (a)'),
      tcell(COLS[1], 'Name(s) of person who have knowledge of the facts of the case'),
      personCols,
    ]},

    // 9. Entity
    { cells: [
      tcell(COLS[0], '9.'),
      tcell(COLS[1], 'Entity in respect of which misconduct alleged'),
      tcell(COLS[2], detail(c.EntityMisconduct)),
    ]},

    // Date / Place / Signature
    { cells: [tcell(COLS[0], ''), tcell(COLS[1], 'Date:'), tcell(COLS[2], fmtD(c.EntryDate) || '—')] },
    { cells: [tcell(COLS[0], ''), tcell(COLS[1], 'Place:'), tcell(COLS[2], detail(c.CompCityName) || '—')] },
    { cells: [
      tcell(COLS[0], ''),
      tcell(COLS[1], 'Signature of the Complainant:', { bold: true }),
      icell(COLS[2], [signImg], 110, 38),
    ]},

    // ----- VERIFICATION -----
    { cells: [tcell(CW, 'VERIFICATION (*)', { bold: true, align: 'c', size: 9.5 })] },
    { cells: [
      tcell(COLS[0], '1.'),
      tcell(COLS[1] + COLS[2], `I,   ${detail(c.Name)}, ${isIndividual ? `${detail(c.Salutation)}  ${detail(c.RelationName)}` : ''}, authorized signatory on behalf of the Complainant do hereby declare that what is stated above is true to the best of my information and belief.`),
    ]},
    { cells: [
      tcell(COLS[0], '2.'),
      tcell(COLS[1] + COLS[2], 'I further declare that I have been duly authorized to file the complaint and the authorization/resolution in this regard has been enclosed along with this form.'),
    ]},
    { cells: [
      tcell(COLS[0], '3.'),
      tcell(COLS[1] + COLS[2], 'I understand that in case of any misstatement of facts or any misrepresentation/suppression of facts/false statements/furnishing of fabricated documents, I am liable to be proceeded with in accordance with the law.'),
    ]},
    { cells: [
      tcell(COLS[0], '4.'),
      tcell(COLS[1] + COLS[2], 'I further understand that in case the complaint is found to be frivolous or to bring disrepute to the Respondent or the organization thereof, I am liable to be proceeded with in accordance with the law.'),
    ]},
    {
      cells: [tcell(CW,
        `Verified today the ${fmtD(c.EntryDate) ? fmtD(c.EntryDate).split('/')[0] : '________'} day of ${
          c.EntryDate ? new Date(c.EntryDate).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '________'
        } at ${detail(c.CompCityName) || '________'}`, { align: 'c', size: 9 })],
    },
    { cells: [
      tcell(COLS[0], ''),
      tcell(COLS[1], 'Name of the Complainant\nDesignation of the Complainant\nSignature of the Complainant'),
      tcell(COLS[2], `${detail(c.Name)}\n${detail(c.RegulatorDesignation)}\nSignature:`),
    ]},
    { cells: [tcell(CW, '(*) Mandatory fields ..................................................', { align: 'c', size: 8.5, bold: true })] },
  ];

  // ======================================================================
  // Render the Form A template
  // ======================================================================
  renderRows([...formRowsStart, ...formRowsBody]);

  // ---------- Status history (compilation) ----------
  if (includeHistory) {
    renderRows([
      {
        cells: [tcell(COLS[0], ''), tcell(COLS[1] + COLS[2], 'Case Compilation — Status History', { bold: true })],
      },
    ]);
    historyTable(history);
  }

  // ---------- Attachments ----------
  if (attach.length) {
    ensureSpace(24);
    y -= 12;
    headingRow('', 'Documents Attached to this Complaint');
    for (const f of attach) {
      const name = f.rel.split('/').pop();
      const ext = name.split('.').pop().toLowerCase();
      const bytes = fs.readFileSync(f.abs);

      const stampDocs = (pages) => {
        for (const p of pages) {
          band(p, A4[1], 24, NAVY);
          let t = name;
          while (fontB.widthOfTextAtSize(t, 9) > A4[0] - 2 * M && t.length > 6) t = t.slice(0, -1) + '…';
          p.drawText(t, { x: M, y: A4[1] - 17, size: 9, font: fontB, color: WHITE });
        }
      };

      if (ext === 'pdf') {
        try {
          const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const pages = await doc.copyPages(src, src.getPageIndices());
          stampDocs(pages);
          pages.forEach((p) => doc.addPage(p));
          y -= 14;
        } catch (e) {
          /* skip unreadable attachment */
        }
      } else if (IMAGE_EXT.includes(ext)) {
        try {
          const img = ext === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
          const ipage = doc.addPage(A4);
          const scale = Math.min((A4[0] - 2 * M) / img.width, (A4[1] - 2 * M) / img.height);
          ipage.drawImage(img, {
            x: (A4[0] - img.width * scale) / 2,
            y: (A4[1] - img.height * scale) / 2,
            width: img.width * scale,
            height: img.height * scale,
          });
          stampDocs([ipage]);
          y -= 14;
        } catch (e) {
          /* skip unreadable image */
        }
      } else {
        /* unsupported format - skip */
      }
    }
  }

  // ---------- Page footers ----------
  const total = doc.getPageCount();
  for (let i = 0; i < total; i += 1) {
    const p = doc.getPage(i);
    const s = `Page ${i + 1} of ${total}`;
    p.drawText(s, { x: (A4[0] - fontR.widthOfTextAtSize(s, 8)) / 2, y: 18, size: 8, font: fontR, color: GRAY });
  }

  const filenameBase = String(c.CompNo || id).replace(/[\\/]/g, '_');
  const buf = await doc.save();
  return { filename: `${filenameBase}.pdf`, data: buf };
}

module.exports = { buildComplaintPdf };