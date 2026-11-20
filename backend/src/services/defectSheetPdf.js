const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { query } = require('../config/db');
const { resolveDocumentPath } = require('./documents');

const A4 = [595.28, 841.89];
const M = 45;
const CW = A4[0] - M * 2;
const PAD = 5;
const NAVY = rgb(0.13, 0.21, 0.31);
const LIGHT = rgb(0.93, 0.95, 0.98);
const DARK = rgb(0.15, 0.18, 0.22);
const GRAY = rgb(0.45, 0.45, 0.45);
const WHITE = rgb(1, 1, 1);
const LINE = rgb(0.6, 0.6, 0.6);
const IMAGE_EXT = ['png', 'jpg', 'jpeg'];

function wrapLines(font, size, text, maxWidth) {
  const out = [];
  for (const raw of String(text == null ? '' : text).split('\n')) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [''];
}

function fmtD(value) {
  return value ? new Date(value).toLocaleDateString('en-GB') : '—';
}

function baseName(value) {
  return String(value || '').replace(/\\/g, '/').split('/').pop();
}

async function loadDefectSheetData(id) {
  const complaintRows = await query(
    `SELECT nc.CompID, nc.CompNo, nc.FormType, nc.Name, nc.ResName,
            u.NameOfTheUser AS ComplainantName
     FROM tbl_NewComplaint nc
     LEFT JOIN tbl_Users u ON nc.UserID = u.UserID
     WHERE nc.CompID = @id`,
    { id }
  );
  if (!complaintRows.length) return null;

  const cycleRows = await query(
    `SELECT TOP 1 CompStatusID FROM tbl_ComplaintStatus
     WHERE CompaintID=@id AND StatusID=3 ORDER BY CompStatusID DESC`,
    { id }
  );
  if (!cycleRows.length) return null;

  const defects = await query(
    `SELECT ComplaintDefectID, DefectCode, DefectText, RelevantColumn, Communication,
            ResponseRemark, ResponseAttachment, RespondedBy, RespondedDate
     FROM tbl_ComplaintDefect
     WHERE CompID=@id AND CompStatusID=@csid
     ORDER BY ComplaintDefectID`,
    { id, csid: Number(cycleRows[0].CompStatusID) }
  );
  const responded = defects.filter((d) => d.ResponseRemark || d.ResponseAttachment || d.RespondedDate);
  if (!responded.length) return null;

  return { complaint: complaintRows[0], defects, responded };
}

async function buildDefectSheet(id, opts) {
  const data = await loadDefectSheetData(id);
  if (!data) return null;

  const doc = await PDFDocument.create();
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontR = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage(A4);
  let y = A4[1] - M;

  const ensureSpace = (needed) => {
    if (y - needed < M) {
      page = doc.addPage(A4);
      y = A4[1] - M;
    }
  };

  const cell = (width, text, opts = {}) => {
    const size = opts.size || 8.5;
    const font = opts.bold ? fontB : fontR;
    return {
      width,
      size,
      font,
      align: opts.align || 'l',
      color: opts.color || DARK,
      lines: wrapLines(font, size, text == null ? '' : String(text), Math.max(4, width - 2 * PAD)),
    };
  };

  const rowHeight = (cells) => Math.max(...cells.map((c) => Math.max(14, c.lines.length * (c.size + 1.5) + 2 * PAD)));

  const renderRow = (cells, header = false) => {
    const height = rowHeight(cells);
    ensureSpace(height + 2);
    let x = M;
    cells.forEach((c, i) => {
      const width = i === cells.length - 1 ? CW - (x - M) : c.width;
      if (header) page.drawRectangle({ x, y: y - height, width, height, color: LIGHT });
      page.drawRectangle({ x, y: y - height, width, height, borderColor: LINE, borderWidth: 0.6 });
      c.lines.forEach((line, li) => {
        const textWidth = c.font.widthOfTextAtSize(line, c.size);
        const tx = c.align === 'c' ? x + (width - textWidth) / 2 : x + PAD;
        page.drawText(line, { x: tx, y: y - PAD - c.size - li * (c.size + 1.5), size: c.size, font: c.font, color: c.color });
      });
      x += width;
    });
    y -= height;
  };

  page.drawRectangle({ x: 0, y: A4[1] - 46, width: A4[0], height: 46, color: NAVY });
  page.drawText('DEFECT SHEET', { x: M, y: A4[1] - 22, size: 15, font: fontB, color: WHITE });
  page.drawText('Rule 5(5) — defects communicated and rectification submitted by the member/complainant', {
    x: M, y: A4[1] - 37, size: 9, font: fontR, color: WHITE,
  });

  const c = data.complaint;
  const details = [
    ['Complaint No.', c.CompNo || String(id)],
    ['Form', `Form ${c.FormType || 'I'}`],
    ['Complainant', c.ComplainantName || c.Name || '—'],
    ['Respondent', c.ResName || '—'],
    ['Generated on', new Date().toLocaleDateString('en-GB')],
    ['Responses', `${data.responded.length} of ${data.defects.length} defect(s)`],
  ];
  details.forEach(([label, value]) => {
    renderRow([cell(CW * 0.24, label, { bold: true }), cell(CW * 0.76, value)]);
  });

  y -= 10;
  const widths = [CW * 0.05, CW * 0.2, CW * 0.17, CW * 0.32, CW * 0.13, CW * 0.13];
  const headers = ['#', 'Defect', 'Form I column', "Member's remark", 'Document', 'Responded on'];
  renderRow(widths.map((w, i) => cell(w, headers[i], { bold: true, size: 8, align: 'c' })), true);

  data.defects.forEach((d, index) => {
    const defectText = [
      String(d.DefectText || '').trim(),
      d.DefectCode ? `Code: ${d.DefectCode}` : '',
      String(d.Communication || '').trim() ? `Communication: ${String(d.Communication).trim()}` : '',
    ].filter(Boolean).join('\n') || '—';
    const remark = [
      String(d.ResponseRemark || '').trim() || (d.ResponseAttachment ? 'Document submitted' : ''),
      d.RespondedDate ? fmtD(d.RespondedDate) : '',
    ].filter(Boolean).join('\n') || 'Pending';
    renderRow([
      cell(widths[0], String(index + 1), { size: 8, align: 'c' }),
      cell(widths[1], defectText, { size: 7.5 }),
      cell(widths[2], d.RelevantColumn || '—', { size: 7.5 }),
      cell(widths[3], remark, { size: 7.5 }),
      cell(widths[4], d.ResponseAttachment ? baseName(d.ResponseAttachment) : '—', { size: 7.5 }),
      cell(widths[5], d.RespondedDate ? fmtD(d.RespondedDate) : '—', { size: 7.5 }),
    ]);
  });

  const seen = new Set();
  const attachmentsToEmbed = !opts || opts.includeAttachments !== false ? data.responded : [];
  for (const d of attachmentsToEmbed) {
    if (!d.ResponseAttachment || seen.has(d.ResponseAttachment)) continue;
    seen.add(d.ResponseAttachment);
    const rel = String(d.ResponseAttachment).replace(/\\/g, '/');
    const resolved = resolveDocumentPath(rel);
    if (!resolved || !fs.existsSync(resolved.abs)) continue;
    const ext = rel.split('.').pop().toLowerCase();
    let bytes;
    try {
      bytes = fs.readFileSync(resolved.abs);
    } catch (e) {
      console.error('defect sheet attachment read error:', e.message);
      continue;
    }
    const title = `Supporting document — ${baseName(rel)}`;
    const stamp = (pages) => {
      pages.forEach((p) => {
        p.drawRectangle({ x: 0, y: A4[1] - 24, width: A4[0], height: 24, color: NAVY });
        let text = title;
        while (fontB.widthOfTextAtSize(text, 9) > A4[0] - 2 * M && text.length > 6) text = `${text.slice(0, -1)}…`;
        p.drawText(text, { x: M, y: A4[1] - 17, size: 9, font: fontB, color: WHITE });
      });
    };
    if (ext === 'pdf') {
      try {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await doc.copyPages(src, src.getPageIndices());
        stamp(pages);
        pages.forEach((p) => doc.addPage(p));
      } catch (e) {
        console.error('defect sheet pdf attachment error:', e.message);
      }
    } else if (IMAGE_EXT.includes(ext)) {
      try {
        const img = ext === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const scale = Math.min((A4[0] - 2 * M) / img.width, (A4[1] - 2 * M - 24) / img.height, 1);
        const imagePage = doc.addPage(A4);
        imagePage.drawImage(img, {
          x: (A4[0] - img.width * scale) / 2,
          y: (A4[1] - 24 - img.height * scale) / 2,
          width: img.width * scale,
          height: img.height * scale,
        });
        stamp([imagePage]);
      } catch (e) {
        console.error('defect sheet image attachment error:', e.message);
      }
    }
  }

  if (!opts || opts.skipFooters !== true) {
    const total = doc.getPageCount();
    for (let i = 0; i < total; i += 1) {
      const p = doc.getPage(i);
      const text = `Page ${i + 1} of ${total}`;
      p.drawText(text, { x: (A4[0] - fontR.widthOfTextAtSize(text, 8)) / 2, y: 18, size: 8, font: fontR, color: GRAY });
    }
  }

  const filenameBase = String(c.CompNo || id).replace(/[\\/]/g, '_');
  return {
    filename: `DefectSheet_${filenameBase}.pdf`,
    data: await doc.save(),
    respondedCount: data.responded.length,
  };
}

module.exports = { buildDefectSheet };
