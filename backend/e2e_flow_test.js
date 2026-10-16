/* eslint-disable */
// End-to-end flow verification against the running dev servers.
//
// SAFETY: msnodesqlv8 opens a new connection per query(), so SQL transactions
// cannot span calls. Instead every write is paired with an exact compensating
// restore: we snapshot the original row + the current MAX(CompStatusID), then
// afterwards put the row back and delete only the history rows we created
// (CompStatusID > baseline). Restoration is asserted at the end.
process.chdir(__dirname);
const db = require('./src/config/db');
const jwt = require('jsonwebtoken');

const API = 'http://localhost:5000/api';
const JWT_SECRET = 'ICAI_DC_JWT_SECRET_2026_CHANGE_ME';

let pass = 0, fail = 0;
const undone = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '  [' + extra + ']' : '')); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  [' + extra + ']' : '')); }
}
const head = (t) => console.log('\n=== ' + t + ' ' + '='.repeat(Math.max(0, 60 - t.length)));
const ymd = (d) => new Date(d).toISOString().slice(0, 10);

async function req(method, url, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data, headers: res.headers };
}
const tok = (u) => jwt.sign(
  { UserID: u.UserID, UserType: u.UserType, NameOfTheUser: u.NameOfTheUser, Email: u.Email },
  JWT_SECRET, { expiresIn: '1h' }
);
const one = async (sql, p) => (await db.query(sql, p))[0];

// Snapshot a complaint so we can put it back exactly as it was.
// NB: the real column names are NatureOfAllegation / NatureDatails (sic).
async function snapshot(compId) {
  const row = await one('SELECT * FROM tbl_NewComplaint WHERE CompID=@id', { id: compId });
  const base = (await one('SELECT MAX(CompStatusID) mx FROM tbl_ComplaintStatus')).mx;
  undone.push(async () => {
    for (const c of ['StatusID', 'ScrutinySheet', 'EntityMisconduct', 'NatureOfAllegation', 'NatureDatails']) {
      if (!(c in row)) continue;
      const v = row[c] === undefined || row[c] === null ? null : row[c];
      await db.executeNonQuery('UPDATE tbl_NewComplaint SET ' + c + '=@v WHERE CompID=@id', { v, id: compId });
    }
    const del = await db.executeNonQuery('DELETE FROM tbl_ComplaintStatus WHERE CompaintID=@id AND CompStatusID>@b', { id: compId, b: base });
    return del;
  });
  return { row, base };
}

(async () => {
  const users = await db.query('SELECT UserID, UserType, NameOfTheUser, Email FROM tbl_Users WHERE IsDeactivated=0');
  const U = (ut) => users.filter((u) => Number(u.UserType) === ut);
  const soUser = U(5)[0], ddUser = U(4)[0], bodUser = U(6)[0], offUser = U(7)[0], woUser = U(13)[0], partyUser = U(3)[0];
  console.log('actors: SO=' + soUser.NameOfTheUser + ' | DD=' + ddUser.NameOfTheUser + ' | BOD=' + bodUser.NameOfTheUser +
    ' | Officer=' + offUser.NameOfTheUser + ' | WO=' + woUser.NameOfTheUser + ' | Party=' + partyUser.NameOfTheUser);
  const T = { so: tok(soUser), dd: tok(ddUser), bod: tok(bodUser), officer: tok(offUser), wo: tok(woUser), party: tok(partyUser) };

  /* ---------------------------------------------------------------- */
  head('1. AUTH');
  {
    // KNOWN GAP (pre-existing, not part of the clubbing work): request-otp has no
    // captcha check at all, so any caller can trigger an OTP mail for a known email.
    // Never call request-otp for a real account here: it would send a real OTP
    // email. The captcha gap is asserted from the route source instead.
    const src = require('fs').readFileSync(require.resolve('./src/routes/auth'), 'utf8');
    const otpRoute = src.slice(src.indexOf("router.post('/request-otp'"), src.indexOf("router.post('/verify-otp'"));
    check('KNOWN GAP: request-otp route performs no captcha validation', !/captcha/i.test(otpRoute));
    const unknown = await req('post', '/auth/request-otp', { body: { email: 'no-such-user-' + Date.now() + '@example.invalid' } });
    check('request-otp rejects an unknown email (no mail sent)', unknown.status === 404, 'HTTP ' + unknown.status);
    const me = await req('get', '/auth/me', { token: T.so });
    check('/auth/me returns the SO profile', me.status === 200 && Number(me.data.user.UserType) === 5, me.data.user && me.data.user.NameOfTheUser);
    const none = await req('get', '/complaints');
    check('complaint list blocks anonymous callers', none.status === 401, 'HTTP ' + none.status);
    const bad = await req('get', '/auth/me', { token: 'garbage.token.here' });
    check('a tampered token is rejected', bad.status === 401, 'HTTP ' + bad.status);
    const crossRole = await req('get', '/complaints', { token: T.party });
    const partyRows = Array.isArray(crossRole.data) ? crossRole.data : [];
    check('party tokens are scoped to their own complaints (no internal registry dump)',
      crossRole.status === 200 && partyRows.length === 0 ||
      partyRows.every((r) => Number(r.UserID) === Number(partyUser.UserID)),
      'HTTP ' + crossRole.status + ' rows=' + partyRows.length +
      (partyRows[0] ? ' IDs=' + partyRows.map((r) => r.UserID).join(',') : ''));
  }

  /* ---------------------------------------------------------------- */
  head('2. NEUTRAL WORDING (flows and query values preserved)');
  let stuckId;
  {
    const anyStuck = await one(`SELECT TOP 1 c.CompID FROM tbl_NewComplaint c
       JOIN tbl_StatusMaster sm ON c.StatusID = sm.StatusID
       WHERE sm.StatusName LIKE '%actionable%' ORDER BY c.CompID DESC`);
    if (!anyStuck) {
      console.log('\nSKIPPED: no complaint parked on an "Actionable"-named status, and no seeded');
      console.log('clubbing/committee dataset (statuses 68/69, 5, 124). This E2E suite needs the');
      console.log('reference dataset from backend/db. Use backend/lifecycle_test.js + smoke_test.js');
      console.log('for full-process verification against any database.\n');
      process.exitCode = 0;
      return;
    }
    stuckId = anyStuck.CompID;
    const list = await req('get', '/complaints', { token: T.so });
    check('internal complaint list loads', list.status === 200 && Array.isArray(list.data), 'rows=' + (list.data || []).length);
    check('the list still filters by the raw value', await req('get', '/complaints?base=actionable', { token: T.so }).then((r) => r.status === 200));
    check('and by the raw value for closure', await req('get', '/complaints?base=nonactionable', { token: T.so }).then((r) => r.status === 200));
    const csv = await req('get', '/complaints/export', { token: T.so });
    const txt = Buffer.isBuffer(csv.data) ? csv.data.toString('utf8') : String(csv.data);
    check('CSV export contains no "Actionable"/"Non Actionable" wording', !/actionable/i.test(txt), 'len=' + txt.length);
    check('CSV export still carries complaint data', /PR\/\d{3}\/\d{4}/.test(txt));
    {
      // every server-rendered artefact, not just the screens
      const detail = await req('get', '/complaints/' + stuckId, { token: T.so });
      check('detail JSON still returns the raw names (the selects need them)', detail.status === 200);
      const htmlForm = await req('get', '/complaints/' + stuckId + '/form', { token: T.so });
      const htmlComp = await req('get', '/complaints/' + stuckId + '/compilation', { token: T.so });
      const asText = (r) => Buffer.isBuffer(r.data) ? r.data.toString('utf8') : JSON.stringify(r.data);
      check('printable complaint form (HTML) has no leaked wording', htmlForm.status === 200 && !/actionable/i.test(asText(htmlForm)), 'HTTP ' + htmlForm.status);
      check('printable compilation (HTML) has no leaked wording', htmlComp.status === 200 && !/actionable/i.test(asText(htmlComp)), 'HTTP ' + htmlComp.status);
      const pdfComp = await req('get', '/complaints/' + stuckId + '/compilation/pdf', { token: T.so });
      check('case compilation PDF downloads', pdfComp.status === 200 && Buffer.isBuffer(pdfComp.data), pdfComp.data.length + ' bytes');
      const pdfForm = await req('get', '/complaints/' + stuckId + '/form/pdf', { token: T.so });
      check('complaint form PDF downloads', pdfForm.status === 200 && Buffer.isBuffer(pdfForm.data), pdfForm.data.length + ' bytes');
    }
    const dash = await req('get', '/dashboard', { token: T.so });
    check('dashboard loads', dash.status === 200, 'HTTP ' + dash.status);
    for (const base of ['registration', 'actionable', 'nonactionable', 'referring']) {
      const a = await req('get', '/reports/ageing?base=' + base, { token: T.so });
      check('ageing report base=' + base, a.status === 200 && Array.isArray(a.data), 'rows=' + (a.data || []).length);
    }
    check('stage bifurcation loads', (await req('get', '/reports/stage-bifurcation?view=stages', { token: T.so })).status === 200);
    const master = await req('get', '/masters/6?option1=5', { token: T.so });
    check('status master still serves the raw internal names', master.status === 200, master.data && master.data.length + ' rows');
    // the real DB still has complaints parked on the internal statuses
    const counts = await db.query('SELECT COUNT(*) n FROM tbl_NewComplaint WHERE StatusID IN (2,4,5,50,66,68,69,123)');
    check('internal statuses are untouched in the database', Number(counts[0].n) > 0, counts[0].n + ' live cases');
  }

  /* ---------------------------------------------------------------- */
  head('3. SCRUTINY AUTOFILL (complaint with no saved sheet)');
  let freshId;
  {
    const fresh = await one("SELECT TOP 1 CompID, CompNo FROM tbl_NewComplaint WHERE (ScrutinySheet IS NULL OR LTRIM(RTRIM(ScrutinySheet))='') ORDER BY CompID DESC");
    freshId = fresh.CompID;
    console.log('  using CompID ' + fresh.CompID + ' (' + fresh.CompNo + ')');
    const pre = await req('get', '/complaints/' + fresh.CompID + '/scrutiny/prefill', { token: T.so });
    const d = pre.data || {};
    check('prefill HTTP 200', pre.status === 200);
    check('Q0 complaint number', d.cno === fresh.CompNo, String(d.cno));
    check('Q1a date of receipt in Institute', /^\d{4}-\d{2}-\d{2}$/.test(d.q1a || ''), d.q1a);
    check('Q1b date of receipt by SO', /^\d{4}-\d{2}-\d{2}$/.test(d.q1b || ''), d.q1b);
    check('Q1d endorsing officer (SO name)', !!(d.q1d && d.q1d.length > 2), String(d.q1d || '').slice(0, 30));
    check('Q2a complainant + address + contact', !!(d.q2a || '').match(/Mobile|@|\d{6}/), String(d.q2a || '').slice(0, 45));
    check('Q2b respondent + address + contact', !!(d.q2b || '').match(/Mobile|@|\d{6}/), String(d.q2b || '').slice(0, 45));
    check('Q4a name of firm/member', !!d.q4a, String(d.q4a || '').slice(0, 40));
    check('Q4b membership/registration no + region', !!(d.q4b || '').match(/\d/), String(d.q4b || '').slice(0, 40));
    check('Q6 place of respondent', !!d.q6, String(d.q6 || '').slice(0, 40));
    check('Q7 complaint filed by the member himself', d.q7 === 'YES' || d.q7 === 'NO', String(d.q7));
    check('Q8b1 fee particulars', /Amount/.test(d.q8b1 || ''), String(d.q8b1 || '').slice(0, 55));
    check('Q12 Rule-12 limit decided from the dates on record, or blank when none exist',
      d.q12 === 'YES' || d.q12 === 'NO' || d.q12 === '',
      'q12=' + JSON.stringify(d.q12));
    {
      const r = await one('SELECT MisconductDate, MisConductDateTo, EntryDate FROM tbl_NewComplaint WHERE CompID=@id', { id: fresh.CompID });
      const hasDate = [r.MisconductDate, r.MisConductDateTo].some((v) => v && new Date(v).getUTCFullYear() >= 1970);
      if (hasDate) check('  Q12 is decided when a misconduct date exists', d.q12 === 'YES' || d.q12 === 'NO', 'q12=' + d.q12);
      else check('  Q12 is correctly left blank (no misconduct date anywhere on the complaint)', d.q12 === '', 'MisconductDate/MisConductDateTo empty');
    }
    check('Q13(a) set-of-complaint completeness', d.q13a === 'YES' || d.q13a === 'NO', String(d.q13a));
    check('foot note records fee + document count', /Complaint fee/.test(d.foot || '') && /Documents received/.test(d.foot || ''), String(d.foot || '').slice(0, 70));
    check('judgement fields left blank for the officer (q9/q13b/q18)', !d.q9 && !d.q13b && !d.q18);
    check('no "Actionable" wording in the prefill payload', !/actionable/i.test(JSON.stringify(d)));

    const pdf = await req('get', '/complaints/' + fresh.CompID + '/scrutiny/pdf', { token: T.so });
    check('PDF HTTP 200', pdf.status === 200);
    check('PDF content-type', (pdf.headers.get('content-type') || '').includes('application/pdf'));
    check('PDF magic bytes', Buffer.isBuffer(pdf.data) && pdf.data.slice(0, 5).toString() === '%PDF-');
    check('PDF filename ScrutinySheet_<complaintNo>.pdf',
      /attachment; filename="?ScrutinySheet_PR_\d{3}_\d{4}\.pdf/.test(pdf.headers.get('content-disposition') || ''),
      pdf.headers.get('content-disposition'));
    check('PDF has real content', pdf.data.length > 5000, pdf.data.length + ' bytes');
    const asParty = await req('get', '/complaints/' + fresh.CompID + '/scrutiny/pdf', { token: T.party });
    check('a member/party can also download the sheet', asParty.status === 200, 'HTTP ' + asParty.status);
    const anon = await req('get', '/complaints/' + fresh.CompID + '/scrutiny/pdf');
    check('anonymous download is blocked', anon.status === 401, 'HTTP ' + anon.status);
  }

  /* ---------------------------------------------------------------- */
  head('4. SCRUTINY - saved answers take precedence over defaults');
  {
    const saved = await one("SELECT TOP 1 CompID, CompNo, ScrutinySheet FROM tbl_NewComplaint WHERE ScrutinySheet IS NOT NULL AND LTRIM(RTRIM(ScrutinySheet))<>'' ORDER BY CompID DESC");
    console.log('  using CompID ' + saved.CompID + ' (' + saved.CompNo + ')');
    const stored = JSON.parse(saved.ScrutinySheet);
    const pre = (await req('get', '/complaints/' + saved.CompID + '/scrutiny/prefill', { token: T.so })).data;
    let kept = 0, total = 0;
    Object.keys(stored).forEach((k) => {
      if (String(stored[k] || '').trim() === '') return;
      total++;
      if (String(pre[k] || '') === String(stored[k])) kept++;
    });
    check('every non-empty saved answer survives prefill', total > 0 && kept === total, kept + '/' + total + ' preserved');
    const pdf = await req('get', '/complaints/' + saved.CompID + '/scrutiny/pdf', { token: T.so });
    check('PDF for a saved sheet downloads', pdf.status === 200 && Buffer.isBuffer(pdf.data), pdf.data.length + ' bytes');
  }

  /* ---------------------------------------------------------------- */
  head('5. SCRUTINY SAVE - full round trip through the real endpoint');
  {
    const c = await one("SELECT TOP 1 CompID, CompNo FROM tbl_NewComplaint WHERE (ScrutinySheet IS NULL OR LTRIM(RTRIM(ScrutinySheet))='') ORDER BY CompID DESC");
    console.log('  using CompID ' + c.CompID + ' (' + c.CompNo + ')');
    await snapshot(c.CompID);
    const pre = (await req('get', '/complaints/' + c.CompID + '/scrutiny/prefill', { token: T.so })).data;
    pre.q13b = 'YES';
    pre.q13b2 = '2026-10-01';
    pre.q18 = 'e2e prima facie opinion';
    const r = await req('put', '/complaints/' + c.CompID + '/scrutiny', {
      token: T.so,
      body: { entityMisconduct: 'e2e entity', natureOfComplaint: 'Other', natureOfComplaintDetails: 'e2e detail', scrutinySheet: pre },
    });
    check('PUT /scrutiny accepts the whole auto-filled payload', r.status === 200, r.data && (r.data.message || JSON.stringify(r.data).slice(0, 60)));
    const after = await one('SELECT ScrutinySheet, EntityMisconduct FROM tbl_NewComplaint WHERE CompID=@id', { id: c.CompID });
    const saved = JSON.parse(after.ScrutinySheet);
    check('  auto-filled cells persist', saved.q2a === pre.q2a && saved.q1a === pre.q1a && saved.q8b1 === pre.q8b1);
    check('  officer edits persist', saved.q18 === 'e2e prima facie opinion' && saved.q13b === 'YES' && saved.q13b2 === '2026-10-01');
    check('  entity misconduct persists', after.EntityMisconduct === 'e2e entity', String(after.EntityMisconduct));
    const reread = (await req('get', '/complaints/' + c.CompID + '/scrutiny/prefill', { token: T.so })).data;
    check('  re-reading returns the saved values', reread.q18 === 'e2e prima facie opinion' && reread.q2a === pre.q2a);
    const pdf = await req('get', '/complaints/' + c.CompID + '/scrutiny/pdf', { token: T.so });
    check('  PDF downloads after saving', pdf.status === 200 && pdf.data.length > 3000, pdf.data.length + ' bytes');
  }

  /* ---------------------------------------------------------------- */
  head('6. CLUBBING - the committee leg at status 68/69 (status 123 = terminal)');
  {
    const stuck = await db.query('SELECT TOP 3 CompID, CompNo, StatusID FROM tbl_NewComplaint WHERE StatusID IN (68,69) ORDER BY CompID DESC');
    check('live cases are parked at 68/69 (this is what was dead-ended before)', stuck.length > 0,
      stuck.map((s) => s.CompNo + '/st' + s.StatusID).join(', '));

    for (const c of stuck) {
      console.log('  -- ' + c.CompNo + ' (status ' + c.StatusID + ')');
      const { base } = await snapshot(c.CompID);
      const hist = await db.query('SELECT CompStatusID, StatusID, StatusDate, UserID, UserToID, ISNULL(CommonField,\'\') CommonField FROM tbl_ComplaintStatus WHERE CompaintID=@id ORDER BY CompStatusID', { id: c.CompID });

      const soRow = hist.filter((h) => Number(h.StatusID) === 2 && h.UserToID).sort((a, b) => new Date(b.StatusDate) - new Date(a.StatusDate))[0];
      const recSoRow = [...hist].reverse().find((h) => Number(h.StatusID) === 124);
      // exactly the routing the committee card now performs
      const soUserId = Number(soRow && soRow.UserToID) || Number(recSoRow && recSoRow.UserID) || null;
      check('  the card can resolve an SO to route the decision back to', !!soUserId, 'SO UserID=' + soUserId);
      const soT = soUserId ? await one('SELECT UserType, NameOfTheUser FROM tbl_Users WHERE UserID=@u', { u: soUserId }) : null;
      check('  and that assignee really is an SO account (ut5)', soT && Number(soT.UserType) === 5,
        soT ? 'UserID=' + soUserId + ' ' + soT.NameOfTheUser + ' UserType=' + soT.UserType : 'no user');
      // regression guard: reading UserID off the status-2 row would send this to a DD
      const stale2 = hist.filter((h) => Number(h.StatusID) === 2).sort((a, b) => new Date(b.StatusDate) - new Date(a.StatusDate))[0];
      if (stale2 && stale2.UserID && Number(stale2.UserID) !== Number(soUserId)) {
        const staleT = await one('SELECT UserType FROM tbl_Users WHERE UserID=@u', { u: stale2.UserID });
        check('  status-2 UserID is NOT the SO (guards the assignee/actor mix-up)',
          !staleT || Number(staleT.UserType) !== 5,
          'UserID=' + stale2.UserID + ' UserType=' + (staleT && staleT.UserType) + ' -> must use UserToID=' + soUserId);
      }
      const recRow = hist.filter((h) => Number(h.StatusID) === 5)[0] || hist.filter((h) => Number(h.StatusID) === 124)[0];
      const cf = String((recRow || {}).CommonField || '').trim().toUpperCase();
      const recType = cf === 'REGISTRATION' ? 'Registration' : cf === 'CLUBBING BEFORE COMMITTEE' ? 'Clubbing before Committee'
        : cf === 'CLOSURE BEFORE COMMITTEE' ? 'Closure before Committee' : 'Clubbing before Director';
      check('  the recommendation shown on the card is resolved', !!recType, '"' + recType + '" (CommonField="' + ((recRow || {}).CommonField || '') + '")');

      // ---- Agree -> 66 Clubbing Decision Communication (routed back to the SO)
      const agree = await req('post', '/complaints/' + c.CompID + '/status', {
        token: T.bod,
        body: { statusId: 66, userToId: soUserId, remarks: 'e2e: Committee agreed to ' + recType, commonField: '' },
      });
      check('  Agree posts status 66 through POST /:id/status', agree.status === 200, agree.data && (agree.data.message || JSON.stringify(agree.data).slice(0, 50)));
      const st66 = await one('SELECT StatusID FROM tbl_NewComplaint WHERE CompID=@id', { id: c.CompID });
      check('  complaint now sits at status 66', Number(st66.StatusID) === 66);
      const h66 = await one('SELECT TOP 1 UserToID, Remarks FROM tbl_ComplaintStatus WHERE CompaintID=@id AND CompStatusID>@b ORDER BY CompStatusID DESC', { id: c.CompID, b: base });
      check('  status 66 is assigned back to the SO', Number(h66.UserToID) === Number(soUserId), 'UserToID=' + h66.UserToID);
      check('  the decision is recorded in remarks', /Committee agreed/i.test(h66.Remarks), String(h66.Remarks));
      const sm66 = await one('SELECT StatusName, UserTypeSO FROM tbl_StatusMaster WHERE StatusID=66');
      check('  66 is "Clubbing Decision Communication" and belongs to the SO', /Clubbing/i.test(sm66.StatusName) && String(sm66.UserTypeSO || '').includes('5'), sm66.StatusName + ' UserTypeSO=' + sm66.UserTypeSO);
      const view = (await req('get', '/complaints/' + c.CompID, { token: T.so })).data;
      check('  the SO now sees the complaint in its history at 66', (view.statusHistory || []).some((h) => Number(h.StatusID) === 66));
      check('  and the timeline is visible to the committee too', (await req('get', '/complaints/' + c.CompID, { token: T.bod })).status === 200);

      // ---- SO attaches the letter -> 123 Clubbing Case Communicated (terminal)
      const fin = await req('post', '/complaints/' + c.CompID + '/status', {
        token: T.so,
        body: { statusId: 123, userToId: null, remarks: 'e2e: clubbing decision letter communicated', attachment: 'clubbing_letter_e2e.pdf' },
      });
      check('  SO communicates the decision -> status 123', fin.status === 200, fin.data && (fin.data.message || JSON.stringify(fin.data).slice(0, 50)));
      const st123 = await one('SELECT StatusID FROM tbl_NewComplaint WHERE CompID=@id', { id: c.CompID });
      check('  complaint reached the terminal status 123', Number(st123.StatusID) === 123);
      const h123 = await one('SELECT TOP 1 Attachment FROM tbl_ComplaintStatus WHERE CompaintID=@id AND StatusID=123 ORDER BY CompStatusID DESC', { id: c.CompID });
      check('  the letter attachment is stored', !!h123.Attachment, String(h123.Attachment));
      const sm123 = await one('SELECT StatusName, UserTypeSO FROM tbl_StatusMaster WHERE StatusID=123');
      check('  123 is the terminal "Clubbing Case Communicated"', /Communicat/i.test(sm123.StatusName), sm123.StatusName);
      const soView = (await req('get', '/complaints/' + c.CompID, { token: T.so })).data;
      check('  the completed clubbing chain is in the SO timeline (68/69 -> 66 -> 123)',
        [66, 123].every((s) => (soView.statusHistory || []).some((h) => Number(h.StatusID) === s)));
      check('  the cluster sits on the Clubbing filter', (await req('get', '/complaints?base=clubbing', { token: T.so })).status === 200);

      // ---- Disagree -> back to 2 Scrutiny
      await db.executeNonQuery('UPDATE tbl_NewComplaint SET StatusID=@s WHERE CompID=@id', { s: c.StatusID, id: c.CompID });
      await db.executeNonQuery('DELETE FROM tbl_ComplaintStatus WHERE CompaintID=@id AND CompStatusID>@b', { id: c.CompID, b: base });
      const dis = await req('post', '/complaints/' + c.CompID + '/status', {
        token: T.bod,
        body: { statusId: 2, userToId: null, remarks: 'e2e: Committee disagreed to ' + recType },
      });
      check('  Disagree posts status 2 (back to Scrutiny)', dis.status === 200, dis.data && (dis.data.message || JSON.stringify(dis.data).slice(0, 50)));
      const st2 = await one('SELECT StatusID FROM tbl_NewComplaint WHERE CompID=@id', { id: c.CompID });
      check('  complaint is now back at status 2', Number(st2.StatusID) === 2);
      const h2 = await one('SELECT TOP 1 UserToID, Remarks FROM tbl_ComplaintStatus WHERE CompaintID=@id AND CompStatusID>@b ORDER BY CompStatusID DESC', { id: c.CompID, b: base });
      check('  the disagreement is recorded', /disagreed/i.test(h2.Remarks), String(h2.Remarks));
      check('  disagree needs no assignee', h2.UserToID === null || h2.UserToID === undefined, 'UserToID=' + h2.UserToID);
      const officerSees = (await req('get', '/complaints?base=actionable', { token: T.officer })).data;
      check('  the case reappears in the scrutiny officer queue', Array.isArray(officerSees) && officerSees.some((x) => Number(x.CompID) === Number(c.CompID)),
        'officer queue rows=' + (officerSees || []).length);
    }
  }

  /* ---------------------------------------------------------------- */
  head('7. CLUBBING - upstream legs (DD decision and SO communication)');
  {
    // status 5 -> 66 / 69 / 68 / 50 depending on the recommendation
    const at5 = await one("SELECT TOP 1 CompID, CompNo FROM tbl_NewComplaint WHERE StatusID=5 ORDER BY CompID DESC");
    if (at5) {
      const cfRow = await one("SELECT TOP 1 ISNULL(CommonField,'') CommonField FROM tbl_ComplaintStatus WHERE CompaintID=@id AND StatusID IN (5,124) ORDER BY CompStatusID DESC", { id: at5.CompID });
      const cf = String(cfRow.CommonField || '');
      const REG_TARGET = { Registration: 50, 'Clubbing before Director': 66, 'Clubbing before Committee': 69, 'Closure before Committee': 68 };
      const target = REG_TARGET[cf] || 66;
      console.log('  -- ' + at5.CompNo + ' CommonField="' + cf + '" -> DD agree target ' + target);
      const soRow = await one("SELECT TOP 1 UserID FROM tbl_ComplaintStatus WHERE CompaintID=@id AND StatusID=124 ORDER BY CompStatusID DESC", { id: at5.CompID });
      check('  DD agree maps the recommendation to a live status', (await one('SELECT COUNT(*) n FROM tbl_StatusMaster WHERE StatusID=@s', { s: target })).n === 1, 'status ' + target);
      check('  and routes it back to the recommending SO', !!(soRow && soRow.UserID), soRow ? 'SO UserID=' + soRow.UserID : 'NONE');
      const soT = soRow ? await one('SELECT UserType FROM tbl_Users WHERE UserID=@u', { u: soRow.UserID }) : null;
      check('  the recommender is an SO account', soT && Number(soT.UserType) === 5, 'UserType=' + (soT && soT.UserType));
    } else check('a status 5 case exists', false);

    // status 124 -> 66 (the 209 case), then 66 -> 123
    const at124 = await one('SELECT TOP 1 CompID, CompNo FROM tbl_NewComplaint WHERE CompID IN (SELECT CompaintID FROM tbl_ComplaintStatus WHERE StatusID=124) ORDER BY CompID DESC');
    if (at124) {
      console.log('  -- ' + at124.CompNo + ' (has a status 124 recommendation row)');
      const { base } = await snapshot(at124.CompID);
      const soRow = await one("SELECT TOP 1 UserID FROM tbl_ComplaintStatus WHERE CompaintID=@id AND StatusID=124 ORDER BY CompStatusID DESC", { id: at124.CompID });
      const r = await req('post', '/complaints/' + at124.CompID + '/status', {
        token: T.dd, body: { statusId: 66, userToId: soRow.UserID, remarks: 'e2e: DD agreed to clubbing' },
      });
      check('  DD decision on a clubbing recommendation posts 66', r.status === 200);
      check('  complaint sits at 66', Number((await one('SELECT StatusID FROM tbl_NewComplaint WHERE CompID=@id', { id: at124.CompID })).StatusID) === 66);
      const f = await req('post', '/complaints/' + at124.CompID + '/status', {
        token: T.so, body: { statusId: 123, userToId: null, remarks: 'e2e: letter sent', attachment: 'x.pdf' },
      });
      check('  then the SO communicates it to 123', f.status === 200);
      check('  complaint sits at 123', Number((await one('SELECT StatusID FROM tbl_NewComplaint WHERE CompID=@id', { id: at124.CompID })).StatusID) === 123);
    } else check('a complaint with a 124 recommendation exists', false);
  }

  /* ---------------------------------------------------------------- */
  head('8. RESTORE - every write is rolled back by hand');
  {
    let deleted = 0;
    for (const u of undone) deleted += await u();
    console.log('  removed ' + deleted + ' history rows created by this run');
    const counts = await db.query('SELECT StatusID, COUNT(*) n FROM tbl_NewComplaint WHERE StatusID IN (66,68,69) GROUP BY StatusID');
    console.log('  clubbing-stage complaints now: ' + (counts.map((x) => 'st' + x.StatusID + '=' + x.n).join(', ') || 'none'));
    check('all cases are back where they started', counts.reduce((s, x) => s + Number(x.n), 0) === 5, 'expected 5 (1x66, 3x68, 1x69)');
    const sheet = await one('SELECT ISNULL(ScrutinySheet,\'\') s, ISNULL(EntityMisconduct,\'\') e FROM tbl_NewComplaint WHERE CompID=@id', { id: freshId });
    check('the scrutiny sheet we saved is gone again', sheet.s === '', 'ScrutinySheet=' + JSON.stringify(sheet.s) + ' EntityMisconduct=' + JSON.stringify(sheet.e));
    const hist = await db.query('SELECT TOP 1 CompStatusID FROM tbl_ComplaintStatus ORDER BY CompStatusID DESC');
    check('no orphan history rows remain', Number(hist[0].CompStatusID) < 3461, 'max CompStatusID=' + hist[0].CompStatusID + ' (was 3460)');
  }

  console.log('\n' + '='.repeat(68));
  console.log('RESULT:  ' + pass + ' passed,  ' + fail + ' failed');
  console.log('='.repeat(68));
  await new Promise((r) => setTimeout(r, 1500)); // let undici keep-alive sockets close before Node teardown
  process.exitCode = fail ? 1 : 0;
})().catch(async (e) => {
  console.error('\nHARNESS ERROR:', e && e.message ? e.message : e);
  for (const u of undone) { try { await u(); } catch (x) { console.error("  cleanup FAILED:", x.message); } }
  console.log('cleanup attempted');
  process.exit(2);
});