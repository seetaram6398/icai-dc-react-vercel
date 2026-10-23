import { useState } from 'react';

const RADIO_SETS = [
  ['mode', { left: 'By Hand', right: 'By Post/Courier' }],
  ['q5', { left: 'YES', right: 'NO' }],
  ['q7', { left: 'YES', right: 'NO' }],
  ['q7a', { left: 'YES', right: 'NO' }],
  ['q7a1', { left: 'YES', right: 'NO' }],
  ['q7a2', { left: 'YES', right: 'NO' }],
  ['q7b', { left: 'YES', right: 'NO' }],
  ['q7b1', { left: 'YES', right: 'NO' }],
  ['q7b2', { left: 'YES', right: 'NO' }],
  ['q7c', { left: 'YES', right: 'NO' }],
  ['q7c1', { left: 'YES', right: 'NO' }],
  ['q7d', { left: 'YES', right: 'NO' }],
  ['q7d1', { left: 'YES', right: 'NO' }],
  ['q8a', { left: 'YES', right: 'NO' }],
  ['q8b', { left: 'YES', right: 'NO' }],
  ['q9', { left: 'YES', right: 'NO' }],
  ['q10a', { left: 'YES', right: 'NO' }],
  ['q10a3', { left: 'YES', right: 'NO' }],
  ['q11a', { left: 'YES', right: 'NO' }],
  ['q11a1', { left: 'YES', right: 'NO' }],
  ['q11a2', { left: 'YES', right: 'NO' }],
  ['q11a3', { left: 'YES', right: 'NO' }],
  ['q11a4', { left: 'YES', right: 'NO' }],
  ['q11a5', { left: 'YES', right: 'NO' }],
  ['q12', { left: 'YES', right: 'NO' }],
  ['q13a', { left: 'YES', right: 'NO' }],
  ['q13b', { left: 'YES', right: 'NO' }],
  ['q13c', { left: 'YES', right: 'NO' }],
];

const DATE_FIELDS = [
  'q1a',
  'q1b',
  'q1e',
  'q10b',
  'q13b2',
];

const TEXT_FIELDS = [
  'q1d',
  'q2a',
  'q2b',
  'q3a',
  'q3b',
  'q4a',
  'q4b',
  'q5b',
  'q6',
  'q7a1_det',
  'q7b1_det',
  'q8b1',
  'q9a',
  'q9b',
  'q9c',
  'q9d',
  'q10a1',
  'q11a1_note',
  'q14',
  'q15',
  'q16',
  'q17',
  'q18',
  'q19',
  'foot',
];

const EMPTY = () => {
  const d = { cno: '' };
  RADIO_SETS.forEach(([k]) => (d[k] = ''));
  DATE_FIELDS.forEach((k) => (d[k] = ''));
  TEXT_FIELDS.forEach((k) => (d[k] = ''));
  return d;
};

function Seg({ name, value, opts, onChange }) {
  return (
    <div className="scseg radio-card-list">
      <label className="radio-card">
        <input
          className="form-check-input"
          type="radio"
          name={name}
          checked={value === opts.left}
          onChange={() => onChange(opts.left)}
        />
        <span className="radio-card-label">{opts.left}</span>
      </label>
      <label className="radio-card">
        <input
          className="form-check-input"
          type="radio"
          name={name}
          checked={value === opts.right}
          onChange={() => onChange(opts.right)}
        />
        <span className="radio-card-label">{opts.right}</span>
      </label>
    </div>
  );
}

function ScrutinySheetForm({ value, onChange, complaintNo, onSave, saved, busy, message, onClear, onDownload }) {
  const [printWin, setPrintWin] = useState(null);
  const d = value || EMPTY();
  const set = (k) => (v) => onChange({ ...d, [k]: v });

  const doPrint = () => {
    if (!printWin || printWin.closed) {
      setPrintWin(window.open('', '_blank', 'width=1000,height=800'));
    }
    const w = printWin;
    w.document.write(`<!DOCTYPE html><html><head><title>Scrutiny Sheet</title><style>
      @page{margin:14mm}
      body{font-family:'Segoe UI',Calibri,serif;font-size:12pt;color:#000;background:#fff}
      h1{text-align:center;font-size:20pt;margin:0 0 4px}
      .sub{text-align:center;font-style:italic;font-size:10pt;margin:2px 0 14px}
      .cno{font-weight:bold;margin:0 0 10px}
      table{width:100%;border-collapse:collapse}
      td{border:1px solid #000;padding:4px 6px;vertical-align:top;font-size:10pt}
      td.n{width:5%;text-align:center;font-weight:bold}
      td.a{width:6%;text-align:center;font-weight:bold}
      td.q{text-align:justify}
      td.v{width:26%}
      .val{min-height:16px;white-space:pre-wrap}
      .ind{display:block;padding-left:14px}
      .yn{display:block;font-style:italic;color:#333}
      .foot{margin-top:14px;border:1px solid #000;padding:10px}
      .foot p{margin:0 0 6px}
      </style></head><body>`);
    w.document.write('<h1>SCRUTINY SHEET</h1>');
    w.document.write('<p class="sub">(In terms of the Chartered Accountants (Procedure of Investigations of Professional and Other Misconduct and Conduct of Cases) Rules, 2007)</p>');
    w.document.write(`<p class="cno">Complaint No. : ${d.cno || complaintNo || ''}</p>`);
    w.document.write('<table>');
    const row = (num, label, val) =>
      `<tr><td class="n">${num}</td><td class="q">${label}</td><td class="v"><div class="val">${String(val || '')}</div></td></tr>`;
    const rows = [
      row('1', 'Date of receipt in the Institute', d.q1a),
      row('1', 'Date of Receipt in the Disciplinary Directorate (Rule 3 proviso)', d.q1b),
      row('1', 'Mode of Receipt (Rule 3(1))', d.mode),
      row('1', 'Name & Designation of the Officer endorsing complaint (including Director) (Rule 5(1))', d.q1d),
      row('1', 'Date of acknowledgement sent to the Complainant (Rule 3(6))', d.q1e),
      row('2', 'Complainant', d.q2a),
      row('2', 'Respondent', d.q2b),
      row('3', 'Place of H.O. of the Firm (if Complaint is against the Firm) (Rule 8(1)(b))', d.q3a),
      row('3', 'Firm Registration Number', d.q3b),
      row('4', 'Name of the Respondent (if Complaint is against individual) (Rule 8(1)(a))', d.q4a),
      row('4', 'Membership Number and Region Concerned', d.q4b),
      row('5', 'Whether Complaint is against more than one Respondent', d.q5),
      row('5', 'If yes, their Names, Membership Numbers and Region concerned', d.q5b),
      row('6', 'Place of Respondent(s) (as per professional address) (Rule 8(1)(a))', d.q6),
      row('7', 'Whether the Complaint is signed, verified and forwarded by the same individual (in his individual capacity)', d.q7),
      row('7(a)', 'If no, whether the Complaint is filed on behalf of the Government – Central or State (Rule 3(2))', d.q7a),
      row('7(a)', 'If yes, whether authorization for filing the Complaint has been made by an officer holding the rank of Joint Secretary, equivalent rank or above in the respective Government', d.q7a1 + (d.q7a1_det ? ' — ' + d.q7a1_det : '')),
      row('7(a)', 'If yes, whether the Complaint has also been signed by an authorized person, namely an officer holding the rank of Under Secretary, equivalent rank or above', d.q7a2),
      row('7(b)', 'Whether the Complaint has been filed on behalf of a statutory authority (e.g., RBI, SEBI etc.) (Rule 3(3))', d.q7b),
      row('7(b)', 'If yes, whether authorization has been made by an officer holding a post equivalent to the rank of Joint Secretary in Government of India', d.q7b1 + (d.q7b1_det ? ' — ' + d.q7b1_det : '')),
      row('7(b)', 'If yes, whether the Complaint has also been signed by the authorized person, (e.g., an officer holding a post equivalent to the rank of Under Secretary)', d.q7b2),
      row('7(c)', 'Whether the Complaint has been filed on behalf of a Company or Firm (Rule 3(4))', d.q7c),
      row('7(c)', 'If yes, whether the Board / Partners / Managing Committee’s Resolution has been received', d.q7c1),
      row('7(d)', 'Whether the Complaint has been filed on behalf of the Bank or Financial Institution (Rule 3(4) expl.)', d.q7d),
      row('7(d)', 'If yes, whether any general Resolution or Power of Attorney has been received', d.q7d1),
      row('8(a)', 'Whether the complaint is eligible for fee waiver (Rule 4(1))', d.q8a),
      row('8(b)', 'Whether the prescribed fee has been received (Rule 4(1))', d.q8b),
      row('8(b)', '– If received, amount of fee, date, number of DD and name/address of Bank (Rule 4(2))', d.q8b1),
      row('9', 'Whether subject matter of complaint is substantially same as or has been covered by any previous complaint or information (Rule 5(4))', d.q9),
      row('9', '– If yes, whether the same is in process (unique reference number and current status) (Rule 5(4))', d.q9a),
      row('9', '– If in process at the end of Director (Discipline) to club the new complaint with previous one (Rule 5(4)(a))', d.q9b),
      row('9', '– If in process at the end of Board of Discipline or Disciplinary Committee, to place new Complaint before the respective authority (Rule 5(4)(b))', d.q9c),
      row('9', '– If orders already passed by the respective authority then give relevant reference number (and place before the same authority for closure) (Rule 5(4)(c))', d.q9d),
      row('10(a)', 'Whether the Complaint has been found to be defective (Rule 5(5))', d.q10a),
      row('10(a)', '– If yes, whether to call the Complainant in person OR to return the complaint for rectification / Resubmission (Rule 5(5))', d.q10a1),
      row('10(a)', '– Cut off date given for rectification / resubmission (Rule 5(5))', d.q10b),
      row('10(a)', '– Whether rectification / resubmission made within the cut off date (if no, to place before the Director (Discipline)) (Rule 5(6))', d.q10a3),
      row('11(a)', 'Whether the complaint received is in accordance with the prescribed “Form ‘I’? Rule 3(1)', d.q11a),
      row('11(a)', 'If yes – Whether all the columns of Form ‘I’ have been filled up, giving no room for any ambiguity', d.q11a1),
      row('11(a)', '– Whether the verification has been correctly carried out', d.q11a2),
      row('11(a)', '– Whether the documents stated to have been enclosed are found attached with the complaint', d.q11a3),
      row('11(a)', '– Whether any paper is in Regional or Hindi language', d.q11a4),
      row('11(a)', '– Whether the allegations made out, fall Under Section 21 together with schedule(s) and/or Section 22', d.q11a5),
      row('12', 'Whether the time limit of 7 years as per Rule 12 has elapsed', d.q12),
      row('13(a)', 'Whether complaint is complete in all respects (Rule 5(3))', d.q13a),
      row('13(b)', 'Whether withdrawal of Complaint has been received from the Complaint (Rule 6)', d.q13b),
      row('13(b)', '– If yes, the date of receipt of such withdrawal letter', d.q13b2),
      row('13(c)', 'If yes, whether the complaint can be registered? (Rule 5(3))', d.q13c),
      row('14', 'Whether notice has been sent to individual / firm within sixty days of receipt of complaint (Rule 8(1))', d.q14),
      row('15', 'Whether statement of defence has been received from member within 21 days / extended time of service of notice', d.q15),
      row('16', 'Whether the statement of defence forwarded to the complainant and date of service of such defence', d.q16),
      row('17', 'Whether statement of rejoinder has been received from Complainant within 21 days / extended time of service of statement of defence', d.q17),
      row('18', 'The date of forming prima facie opinion by the Director whether the defendant is guilty or not guilty and the details of schedule', d.q18),
      row('19', 'In case the prima facie opinion held / not held guilty by Director Discipline is accepted or reversed by the Board of Discipline', d.q19),
    ];
    w.document.write(rows.join(''));
    w.document.write('</table>');
    w.document.write('<div class="foot"><p>Complaint in Form ‘I’ received in one set / duplicate / triplicate alongwith / without complaint fee and documents in one set / duplicate / triplicate.</p><p>On scrutiny, no / following defects found.</p>' + String(d.foot || '') + '</div>');
    w.document.write('</body></html>');
    w.document.close();
    w.focus();
    setTimeout(() => {
      try { w.print(); } catch (e) { /* printing blocked */ }
    }, 300);
  };

  return (
    <div>
      <style>{`
        .sc-wrap .scseg{display:inline-flex;flex-direction:row;gap:8px;vertical-align:top}
        .sc-wrap .scseg .radio-card{padding:6px 14px}
        .sc-wrap .scseg .radio-card-label{font-size:13px}
        .sc-wrap .scn{text-align:center;font-weight:800;color:#fff;background:#0b3a67;width:44px}
        .sc-wrap .sca{text-align:center;font-weight:700;color:#0b3a67;background:#e3f0fb;width:56px}
        .sc-wrap td{vertical-align:top}
        .sc-wrap td textarea{font-size:13px}
        @media print{.sc-printless{display:none !important}}
      `}</style>
      <div className="sc-wrap">
        <div className="d-flex justify-content-between align-items-center mb-3 sc-printless">
          <span className="fw-semibold"><i className="bi bi-clipboard-check me-1" />SCRUTINY SHEET</span>
          <div className="d-flex gap-2">
            {onDownload && (
              <button type="button" className="btn btn-outline-success btn-sm" onClick={onDownload} title="Download this sheet as a PDF with every value filled in">
                <i className="bi bi-file-earmark-arrow-down me-1" />Download
              </button>
            )}
            <button type="button" className="btn btn-outline-primary btn-sm" onClick={doPrint}>
              <i className="bi bi-printer me-1" />Print
            </button>
            <button type="button" className="btn btn-outline-danger btn-sm" onClick={onClear}>
              <i className="bi bi-eraser me-1" />Clear form
            </button>
          </div>
        </div>
        <p className="small text-muted mb-3">
          (In terms of the Chartered Accountants (Procedure of Investigations of Professional and Other Misconduct and Conduct of Cases) Rules, 2007)
        </p>

        <div className="mb-3" style={{ maxWidth: 400 }}>
          <label className="form-label small fw-semibold">Complaint No.</label>
          <input className="form-control" value={d.cno || complaintNo || ''} readOnly />
        </div>

        <div className="table-responsive mb-3" style={{ border: '1px solid #c7dcef', borderRadius: 10 }}>
          <table className="table table-bordered table-sm align-middle mb-0 sc-table">
            <tbody>
              <tr>
                <td className="scn" rowSpan={5}>1</td>
                <td colSpan={2} className="small">Date of receipt in the Institute</td>
                <td style={{ width: '26%' }}><input type="date" className="form-control" value={d.q1a} onChange={(e) => set('q1a')(e.target.value)} /></td>
              </tr>
              <tr><td colSpan={2} className="small">Date of Receipt in the Disciplinary Directorate <i>(Rule 3 proviso)</i></td><td><input type="date" className="form-control" value={d.q1b} onChange={(e) => set('q1b')(e.target.value)} /></td></tr>
              <tr><td colSpan={2} className="small">Mode of Receipt (Rule 3(1))</td><td><Seg name="mode" value={d.mode} opts={{ left: 'By Hand', right: 'By Post/Courier' }} onChange={set('mode')} /></td></tr>
              <tr><td colSpan={2} className="small">Name &amp; Designation of the Officer endorsing complaint (including Director) (Rule 5(1))</td><td><textarea className="form-control" rows={2} value={d.q1d} onChange={(e) => set('q1d')(e.target.value)} /></td></tr>
              <tr><td colSpan={2} className="small">Date of acknowledgement sent to the Complainant (Rule 3(6))</td><td><input type="date" className="form-control" value={d.q1e} onChange={(e) => set('q1e')(e.target.value)} /></td></tr>

              <tr><td className="scn" rowSpan={2}>2</td><td colSpan={2} className="small">Complainant</td><td><textarea className="form-control" rows={2} value={d.q2a} onChange={(e) => set('q2a')(e.target.value)} /></td></tr>
              <tr><td colSpan={2} className="small">Respondent</td><td><textarea className="form-control" rows={2} value={d.q2b} onChange={(e) => set('q2b')(e.target.value)} /></td></tr>

              <tr><td className="scn" rowSpan={2}>3</td><td colSpan={2} className="small">Place of H.O. of the Firm (if Complaint is against the Firm) (Rule 8(1)(b))</td><td><input type="text" className="form-control" value={d.q3a} onChange={(e) => set('q3a')(e.target.value)} /></td></tr>
              <tr><td colSpan={2} className="small">Firm Registration Number</td><td><input type="text" className="form-control" value={d.q3b} onChange={(e) => set('q3b')(e.target.value)} /></td></tr>

              <tr><td className="scn" rowSpan={2}>4</td><td colSpan={2} className="small">Name of the Respondent (if Complaint is against individual) (Rule 8(1)(a))</td><td><input type="text" className="form-control" value={d.q4a} onChange={(e) => set('q4a')(e.target.value)} /></td></tr>
              <tr><td colSpan={2} className="small">Membership Number and Region Concerned</td><td><input type="text" className="form-control" value={d.q4b} onChange={(e) => set('q4b')(e.target.value)} /></td></tr>

              <tr><td className="scn" rowSpan={2}>5</td><td colSpan={2} className="small">Whether Complaint is against more than one Respondent</td><td><Seg name="q5" value={d.q5} opts={{ left: 'YES', right: 'NO' }} onChange={set('q5')} /></td></tr>
              <tr><td colSpan={2} className="small">If yes, their Names, Membership Numbers and Region concerned</td><td><textarea className="form-control" rows={2} value={d.q5b} onChange={(e) => set('q5b')(e.target.value)} /></td></tr>

              <tr><td className="scn">6</td><td colSpan={2} className="small">Place of Respondent(s) (as per professional address) (Rule 8(1)(a))</td><td><input type="text" className="form-control" value={d.q6} onChange={(e) => set('q6')(e.target.value)} /></td></tr>

              <tr>
                <td className="scn" rowSpan={11}>7</td>
                <td colSpan={2} className="small">Whether the Complaint is signed, verified and forwarded by the same individual (in his individual capacity)</td>
                <td><Seg name="q7" value={d.q7} opts={{ left: 'YES', right: 'NO' }} onChange={set('q7')} /></td>
              </tr>
              <tr><td className="sca" rowSpan={3}>7(a)</td><td className="small">If no, whether the Complaint is filed on behalf of the Government – Central or State (Rule 3(2))</td><td><Seg name="q7a" value={d.q7a} opts={{ left: 'YES', right: 'NO' }} onChange={set('q7a')} /></td></tr>
              <tr><td className="small">If yes, whether authorization for filing the Complaint has been made by an officer holding the rank of Joint Secretary, equivalent rank or above in the respective Government (Rule 3(2))</td><td><Seg name="q7a1" value={d.q7a1} opts={{ left: 'YES', right: 'NO' }} onChange={set('q7a1')} /><textarea className="form-control mt-1" rows={2} placeholder="Name, designation, date of authorization" value={d.q7a1_det} onChange={(e) => set('q7a1_det')(e.target.value)} /></td></tr>
              <tr><td className="small">If yes, whether the Complaint has also been signed by an authorized person, namely an officer holding the rank of Under Secretary, equivalent rank or above in the respective Government (Rule 3(2))</td><td><Seg name="q7a2" value={d.q7a2} opts={{ left: 'YES', right: 'NO' }} onChange={set('q7a2')} /></td></tr>
              <tr><td className="sca" rowSpan={3}>7(b)</td><td className="small">Whether the Complaint has been filed on behalf of a statutory authority (e.g., RBI, SEBI etc.) (Rule 3(3))</td><td><Seg name="q7b" value={d.q7b} opts={{ left: 'YES', right: 'NO' }} onChange={set('q7b')} /></td></tr>
              <tr><td className="small">If yes, whether authorization has been made by an officer holding a post equivalent to the rank of Joint Secretary in Government of India (Rule 3(3))</td><td><Seg name="q7b1" value={d.q7b1} opts={{ left: 'YES', right: 'NO' }} onChange={set('q7b1')} /><textarea className="form-control mt-1" rows={2} placeholder="Name, designation, date of authorization" value={d.q7b1_det} onChange={(e) => set('q7b1_det')(e.target.value)} /></td></tr>
              <tr><td className="small">If yes, whether the Complaint has also been signed by the authorized person, (e.g., an officer holding a post equivalent to the rank of Under Secretary, equivalent rank or above in the Central or State Government (Rule 3(3))</td><td><Seg name="q7b2" value={d.q7b2} opts={{ left: 'YES', right: 'NO' }} onChange={set('q7b2')} /></td></tr>
              <tr><td className="sca" rowSpan={2}>7(c)</td><td className="small">Whether the Complaint has been filed on behalf of a Company or Firm (Rule 3(4)) (Firm includes firm of Chartered Accountants as well)</td><td><Seg name="q7c" value={d.q7c} opts={{ left: 'YES', right: 'NO' }} onChange={set('q7c')} /></td></tr>
              <tr><td className="small">If yes, whether the Board / Partners / Managing Committee’s Resolution has been received and that the Resolution also specifically authorizes an officer or person to make Complaint (Rule 3(4))</td><td><Seg name="q7c1" value={d.q7c1} opts={{ left: 'YES', right: 'NO' }} onChange={set('q7c1')} /></td></tr>
              <tr><td className="sca" rowSpan={2}>7(d)</td><td className="small">Whether the Complaint has been filed on behalf of the Bank or Financial Institution (Rule 3(4) expl.)</td><td><Seg name="q7d" value={d.q7d} opts={{ left: 'YES', right: 'NO' }} onChange={set('q7d')} /></td></tr>
              <tr><td className="small">If yes, whether any general Resolution or Power of Attorney has been received and whether the same also authorizes the officer holding particular, position to file the complaint (Rule 3(4) expl.)</td><td><Seg name="q7d1" value={d.q7d1} opts={{ left: 'YES', right: 'NO' }} onChange={set('q7d1')} /></td></tr>

              <tr><td className="scn" rowSpan={3}>8</td><td className="sca">8(a)</td><td className="small">Whether the complaint is eligible for fee waiver (Complaints of Central / State Governments and statutory authorities eligible for fee waiver) (Rule 4(1))</td><td><Seg name="q8a" value={d.q8a} opts={{ left: 'YES', right: 'NO' }} onChange={set('q8a')} /></td></tr>
              <tr><td className="sca" rowSpan={2}>8(b)</td><td className="small">Whether the prescribed fee has been received (Rule 4(1))</td><td><Seg name="q8b" value={d.q8b} opts={{ left: 'YES', right: 'NO' }} onChange={set('q8b')} /></td></tr>
              <tr><td className="small">– If received, amount of fee, date, number of DD and name/address of Bank (Rule 4(2))</td><td><textarea className="form-control" rows={2} value={d.q8b1} onChange={(e) => set('q8b1')(e.target.value)} /></td></tr>

              <tr><td className="scn" rowSpan={5}>9</td><td colSpan={2} className="small">Whether subject matter of complaint is substantially same as or has been covered by any previous complaint or information (Rule 5(4))</td><td><Seg name="q9" value={d.q9} opts={{ left: 'YES', right: 'NO' }} onChange={set('q9')} /></td></tr>
              <tr><td colSpan={2} className="small">– If yes, whether the same is in process (give unique reference number and current status) (Rule 5(4))</td><td><textarea className="form-control" rows={2} value={d.q9a} onChange={(e) => set('q9a')(e.target.value)} /></td></tr>
              <tr><td colSpan={2} className="small">– If in process at the end of Director (Discipline) to club the new complaint with previous one and to inform both the first Complainant, the new Complainant and the Respondent (Rule 5(4)(a))</td><td><textarea className="form-control" rows={2} value={d.q9b} onChange={(e) => set('q9b')(e.target.value)} /></td></tr>
              <tr><td colSpan={2} className="small">– If in process at the end of Board of Discipline or Disciplinary Committee as the case may be, to place new Complaint before the respective authority for Orders (Rule 5(4)(b))</td><td><textarea className="form-control" rows={2} value={d.q9c} onChange={(e) => set('q9c')(e.target.value)} /></td></tr>
              <tr><td colSpan={2} className="small">– If orders already passed by the respective authority then give relevant reference number (and place before the same authority for closure) (Rule 5(4)(c))</td><td><textarea className="form-control" rows={2} value={d.q9d} onChange={(e) => set('q9d')(e.target.value)} /></td></tr>

              <tr><td className="scn" rowSpan={4}>10</td><td className="sca" rowSpan={4}>10(a)</td><td className="small">Whether the Complaint has been found to be defective (Rule 5(5))</td><td><Seg name="q10a" value={d.q10a} opts={{ left: 'YES', right: 'NO' }} onChange={set('q10a')} /></td></tr>
              <tr><td className="small">– If yes, whether to call the Complainant in person OR to return the complaint for rectification / Resubmission (Rule 5(5))</td><td><textarea className="form-control" rows={2} value={d.q10a1} onChange={(e) => set('q10a1')(e.target.value)} /></td></tr>
              <tr><td className="small">– Cut off date given for rectification / resubmission (Rule 5(5))</td><td><input type="date" className="form-control" value={d.q10b} onChange={(e) => set('q10b')(e.target.value)} /></td></tr>
              <tr><td className="small">– Whether rectification / resubmission made within the cut off date (if no, to place before the Director (Discipline) for further processing) (Rule 5(6))</td><td><Seg name="q10a3" value={d.q10a3} opts={{ left: 'YES', right: 'NO' }} onChange={set('q10a3')} /></td></tr>

              <tr><td className="scn" rowSpan={7}>11</td><td className="sca" rowSpan={7}>11(a)</td><td className="small">Whether the complaint received is in accordance with the prescribed “Form ‘I’? Rule 3(1)</td><td><Seg name="q11a" value={d.q11a} opts={{ left: 'YES', right: 'NO' }} onChange={set('q11a')} /></td></tr>
              <tr><td className="small">If yes –</td><td></td></tr>
              <tr><td className="small">– Whether all the columns of Form ‘I’ have been filled up, giving no room for any ambiguity</td><td><Seg name="q11a1" value={d.q11a1} opts={{ left: 'YES', right: 'NO' }} onChange={set('q11a1')} /></td></tr>
              <tr><td className="small">– Whether the verification has been correctly carried out</td><td><Seg name="q11a2" value={d.q11a2} opts={{ left: 'YES', right: 'NO' }} onChange={set('q11a2')} /></td></tr>
              <tr><td className="small">– Whether the documents stated to have been enclosed are found attached with the complaint</td><td><Seg name="q11a3" value={d.q11a3} opts={{ left: 'YES', right: 'NO' }} onChange={set('q11a3')} /></td></tr>
              <tr><td className="small">– Whether any paper is in Regional or Hindi language</td><td><Seg name="q11a4" value={d.q11a4} opts={{ left: 'YES', right: 'NO' }} onChange={set('q11a4')} /></td></tr>
              <tr><td className="small">– Whether the allegations made out, fall Under Section 21 together with schedule(s) and/or Section 22</td><td><Seg name="q11a5" value={d.q11a5} opts={{ left: 'YES', right: 'NO' }} onChange={set('q11a5')} /></td></tr>

              <tr><td className="scn">12</td><td colSpan={2} className="small">Whether the time limit of 7 years as per Rule 12 has elapsed</td><td><Seg name="q12" value={d.q12} opts={{ left: 'YES', right: 'NO' }} onChange={set('q12')} /></td></tr>

              <tr><td className="scn" rowSpan={4}>13</td><td className="sca">13(a)</td><td className="small">Whether complaint is complete in all respects (Rule 5(3))</td><td><Seg name="q13a" value={d.q13a} opts={{ left: 'YES', right: 'NO' }} onChange={set('q13a')} /></td></tr>
              <tr><td className="sca" rowSpan={2}>13(b)</td><td className="small">Whether withdrawal of Complaint has been received from the Complaint (Rule 6)</td><td><Seg name="q13b" value={d.q13b} opts={{ left: 'YES', right: 'NO' }} onChange={set('q13b')} /></td></tr>
              <tr><td className="small">– If yes, the date of receipt of such withdrawal letter</td><td><input type="date" className="form-control" value={d.q13b2} onChange={(e) => set('q13b2')(e.target.value)} /></td></tr>
              <tr><td className="sca">13(c)</td><td className="small">If yes, whether the complaint can be registered? (Rule 5(3))</td><td><Seg name="q13c" value={d.q13c} opts={{ left: 'YES', right: 'NO' }} onChange={set('q13c')} /></td></tr>

              <tr><td className="scn">14</td><td colSpan={2} className="small">Whether notice has been sent to individual / firm within sixty days of receipt of complaint (Rule 8(1))</td><td><textarea className="form-control" rows={2} value={d.q14} onChange={(e) => set('q14')(e.target.value)} /></td></tr>
              <tr><td className="scn">15</td><td colSpan={2} className="small">Whether statement of defence has been received from member within 21 days / extended time of service of notice. Details of receipt shall be filled</td><td><textarea className="form-control" rows={2} value={d.q15} onChange={(e) => set('q15')(e.target.value)} /></td></tr>
              <tr><td className="scn">16</td><td colSpan={2} className="small">Whether the statement of defence forwarded to the complainant and date of service of such defence</td><td><textarea className="form-control" rows={2} value={d.q16} onChange={(e) => set('q16')(e.target.value)} /></td></tr>
              <tr><td className="scn">17</td><td colSpan={2} className="small">Whether statement of rejoinder has been received from Complainant within 21 days / extended time of service of statement of defence. Details of such rejoinder</td><td><textarea className="form-control" rows={2} value={d.q17} onChange={(e) => set('q17')(e.target.value)} /></td></tr>
              <tr><td className="scn">18</td><td colSpan={2} className="small">The date of forming prima facie opinion by the Director whether the defendant is guilty or not guilty and the details of schedule under which they are guilty or not</td><td><textarea className="form-control" rows={2} value={d.q18} onChange={(e) => set('q18')(e.target.value)} /></td></tr>
              <tr><td className="scn">19</td><td colSpan={2} className="small">In case the prima facie opinion held / not held guilty by Director Discipline is accepted or reversed by the Board of Discipline</td><td><textarea className="form-control" rows={2} value={d.q19} onChange={(e) => set('q19')(e.target.value)} /></td></tr>
            </tbody>
          </table>
        </div>

        <div className="mb-3 p-3" style={{ background: '#e5f6ee', border: '1px solid #bfe4d4', borderLeft: '5px solid #158a5e', borderRadius: 8 }}>
          <p className="small mb-1">
            Complaint in Form ‘I’ received in one set / duplicate / triplicate alongwith / without complaint fee and documents in one set / duplicate / triplicate.
          </p>
          <p className="small mb-1">On scrutiny, no / following defects found.</p>
          <textarea className="form-control" rows={3} value={d.foot} onChange={(e) => set('foot')(e.target.value)} />
        </div>

        {message && (
          <div className={`alert ${String(message).includes('success') ? 'alert-success' : 'alert-danger'} py-2 small`}>{message}</div>
        )}
        <div className="sc-printless">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onSave}>
            {busy && <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />}
            <i className="bi bi-check2-circle me-1" />{saved ? 'Update Scrutiny Sheet' : 'Submit Scrutiny Sheet'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ScrutinySheetForm;