/* eslint-disable */
// Full process lifecycle test — drives every major workflow through the real
// running API (no mocking) and restores the DB afterwards:
//
//   A) upload + authenticated document serving
//   B) file complaint (individual) -> auto-assign SO
//   C) scrutiny: prefill save + PDF
//   D) written statement (SO -> respondent -> SO) + rejoinder (SO -> complainant)
//   E) clubbing recommendation chain -> terminal status 123
//   F) firm complaint: answerable members add/senior + per-member WS
//   G) agenda generation + secretary/PO approval
//   H) hearing: create, preference, witnesses, bench attendance, adjournment
//   I) court decision
//   J) stay put/remove
//   K) dashboards + reports reflect the data
//
// Every row created is deleted at the end (complaint, children, status history,
// agenda, cause list, witnesses, decisions, stay, sub-statuses, temp users).
process.chdir(__dirname);
require('dotenv').config();
const db = require('./src/config/db');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const API = 'http://localhost:5000/api';
const SECRET = process.env.JWT_SECRET || 'ICAI_DC_JWT_SECRET_2026_CHANGE_ME';

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '  [' + extra + ']' : '')); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (extra ? '  [' + extra + ']' : '')); }
}
const head = (t) => console.log('\n=== ' + t + ' ' + '='.repeat(Math.max(0, 56 - t.length)));

async function req(method, url, { token, body, raw, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url.startsWith('http') ? url : API + url, { method, headers, body: form ? form : body ? JSON.stringify(body) : undefined });
  const ct = res.headers.get('content-type') || '';
  let data;
  if (raw) data = Buffer.from(await res.arrayBuffer());
  else if (ct.includes('application/json')) data = await res.json().catch(() => ({}));
  else data = Buffer.from(await res.arrayBuffer());
  return { status: res.status, data, headers: res.headers };
}
const tok = (u) => jwt.sign(
  { UserID: u.UserID, UserType: u.UserType, NameOfTheUser: u.NameOfTheUser, LoginID: u.LoginID, MembershipNo: u.MembershipNo || '', Email: u.Email || '' },
  SECRET, { expiresIn: '1h' }
);

(async () => {
  const users = await db.query('SELECT UserID, UserType, NameOfTheUser, LoginID, MembershipNo, Email, IsDeactivated FROM tbl_Users');
  const U = (ut) => users.find((u) => Number(u.UserType) === ut && Number(u.IsDeactivated) === 0);
  const soU = U(5), ddU = U(4), bodU = U(6), officerU = U(7), woU = U(13), partyU = U(3);
  const T = { so: tok(soU), dd: tok(ddU), bod: tok(bodU), officer: tok(officerU), wo: tok(woU), party: tok(partyU) };
  console.log('actors: party=' + partyU.NameOfTheUser + ' | SO=' + soU.NameOfTheUser + ' | DD=' + ddU.NameOfTheUser + ' | BOD=' + bodU.NameOfTheUser + ' | WO=' + woU.NameOfTheUser);

  // master lookup helpers
  const m = async (type, o1) => (await req('get', '/masters/' + type + (o1 != null ? '?option1=' + o1 : ''), { token: T.dd })).data || [];
  const schedList = await m(8); const sched = schedList[0];
  const partList = await m(10, sched.value); const part = partList[0];
  const itemList = await m(9, part.value); const item = itemList[0];
  const docList = await m(5); const doc = docList[0];
  const payList = await m(4); const pay = payList[0];
  const adjList = await m(20); const adj = adjList[0];
  const decList = await m(23, 1); const dec = decList[0];
  const cityList = await m(7, 1); const city = cityList[0];
  const benchRow = (await db.query('SELECT TOP 1 BMID b FROM tbl_Users WHERE BMID IS NOT NULL').catch(() => []))[0];

  const created = { comps: [], emails: [], files: [] };
  const cleanup = async () => {
    for (const cid of created.comps) {
      const clids = (await db.query('SELECT CauseListID c FROM tbl_CauseList WHERE CompID=@i', { i: cid }).catch(() => [])).map((r) => r.c);
      for (const cl of clids) {
        await db.executeNonQuery('DELETE FROM tbl_Decision WHERE CauseListID=@c', { c: cl }).catch(() => {});
        await db.executeNonQuery('DELETE FROM tbl_BenchAttendance WHERE CLID=@c', { c: cl }).catch(() => {});
        await db.executeNonQuery('DELETE FROM tbl_Witness WHERE CauseListID=@c', { c: cl }).catch(() => {});
        await db.executeNonQuery('DELETE FROM tbl_AdjournmentResponse WHERE HearingID=@c', { c: cl }).catch(() => {});
      }
      await db.executeNonQuery('DELETE FROM tbl_CauseList WHERE CompID=@i', { i: cid }).catch(() => {});
      await db.executeNonQuery('DELETE FROM tbl_Ajenda WHERE CompID=@i', { i: cid }).catch(() => {});
      await db.executeNonQuery('DELETE FROM tbl_StayDetails WHERE CompID=@i', { i: cid }).catch(() => {});
      await db.executeNonQuery('DELETE FROM tbl_AnswerableMember WHERE CompID=@i', { i: cid }).catch(() => {});
      await db.executeNonQuery('DELETE FROM tbl_ComplaintSubStatus WHERE CompID=@i', { i: cid }).catch(() => {});
      await db.executeNonQuery('DELETE FROM tbl_ComplaintStatus WHERE CompaintID=@i', { i: cid }).catch(() => {});
      await db.executeNonQuery('DELETE FROM tbl_ComplaintDocument WHERE CompID=@i', { i: cid }).catch(() => {});
      await db.executeNonQuery('DELETE FROM tbl_FactPersons WHERE CompID=@i', { i: cid }).catch(() => {});
      await db.executeNonQuery('DELETE FROM tbl_ScheduleList WHERE CompID=@i', { i: cid }).catch(() => {});
      await db.executeNonQuery('DELETE FROM tbl_AudioVideoAttachment WHERE ComplaintID=@i', { i: cid }).catch(() => {});
      await db.executeNonQuery('DELETE FROM tbl_NewComplaint WHERE CompID=@i', { i: cid }).catch(() => {});
    }
    for (const e of created.emails) {
      await db.executeNonQuery('DELETE FROM tbl_Users WHERE LOWER(LTRIM(RTRIM(Email)))=@e', { e: e.toLowerCase() }).catch(() => {});
    }
    for (const f of created.files) fs.rmSync(f, { force: true });
  };

  const filePayload = (resEmail, extra) => Object.assign({
    compTypeId: 1,
    resName: 'E2E RESPONDENT',
    resRegistrationNo: '112233',
    resCountryCode: '91',
    resMobileNo: '9876543210',
    resEmailID: resEmail,
    resProfessionalAddress: '12 Professional Road',
    resCommunicationAddress: '34 Communication Road',
    resStateId: 1,
    resCityId: city.value,
    briefStatement: 'e2e brief statement',
    particularMisconduct: 'e2e misconduct particulars',
    paymentMode: pay.value,
    paymentDate: '2026-10-10',
    transRefNo: 'TXN' + Date.now(),
    instrumentNo: 'INS' + Date.now(),
    instrumentDate: '2026-10-08',
    taxableAmount: 2950,
    taxRate: 18,
    paymentDetails: 'Payment via ' + pay.label,
    schedules: [{ schedule: sched.value, partNo: part.value, itemNo: item.value, misconductDate: '2026-09-01', misconductDateTo: '2026-09-30' }],
    documents: [{ documentId: doc.value, docUrl: 'RespondentReply/dummy.pdf' }],
    factPersons: [{ personName: 'Fact Witness One', personMobile: '8123456780', personEmail: 'fw1@example.invalid' }],
    entityMisconduct: 'e2e entity misconduct',
    declaration: true,
  }, extra);

  const stU = (cid, sid, r, opts) => req('post', '/complaints/' + cid + '/status', { token: r, body: Object.assign({ statusId: sid, remarks: 'e2e lifecycle transition' }, opts || {}) });

  try {
    /* ------------------------------------------------------------ */
    head('A. UPLOAD + DOCUMENT SERVING');
    const dummyPdf = path.join(__dirname, '..', 'TheTemp', 'lifecycle_dummy.pdf');
    fs.mkdirSync(path.dirname(dummyPdf), { recursive: true });
    fs.writeFileSync(dummyPdf, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n%%EOF\n');
    created.files.push(dummyPdf);
    const fd = new FormData();
    fd.append('type', 'respondent');
    fd.append('file', new Blob([fs.readFileSync(dummyPdf)], { type: 'application/pdf' }), 'lifecycle_dummy.pdf');
    const up = await req('post', '/upload', { token: T.party, form: fd, raw: true });
    let relPath = null;
    if (up.status === 200) { relPath = JSON.parse(up.data.toString('utf8')).relativePath; }
    check('POST /api/upload stores a respondent PDF', up.status === 200 && relPath, relPath);
    created.files.push(path.join(__dirname, '..', 'Documents', String(relPath).replace(/\//g, path.sep)));
    if (relPath) {
      const g = await req('get', 'http://localhost:5000/documents/' + relPath, { token: T.party, raw: true });
      check('GET /documents/<file> serves the uploaded PDF', g.status === 200 && g.data.slice(0, 5).toString() === '%PDF-', g.data.length + ' bytes');
    }
    check('anonymous document access blocked', (await req('get', 'http://localhost:5000/documents/' + (relPath || 'x.pdf'))).status === 401);

    /* ------------------------------------------------------------ */
    head('B. FILE A COMPLAINT (individual)');
    const resEmail = 'resp-' + Date.now() + '@example.invalid';
    created.emails.push(resEmail);
    const p = filePayload(resEmail, {});  // uses /documents/'RespondentReply'
    p.documents = [{ documentId: doc.value, docUrl: relPath }];
    const createdComp = await req('post', '/complaints', { token: T.party, body: p });
    const cid = createdComp.data.CompID;
    check('POST /api/complaints creates the complaint (201)', createdComp.status === 201 && cid, createdComp.data.CompNo);
    created.comps.push(cid);
    const det1 = (await req('get', '/complaints/' + cid, { token: T.so })).data;
    check('status auto-assigned to SO (Status 2)', Number(det1.StatusID) === 2, 'StatusID=' + det1.StatusID);
    check('history has New Complaint + auto-assign rows', (det1.statusHistory || []).some((h) => Number(h.StatusID) === 1) && (det1.statusHistory || []).some((h) => Number(h.StatusID) === 2),
      (det1.statusHistory || []).map((h) => h.StatusID).join(','));
    check('fresh dashboard / complaint list sees it', (await req('get', '/complaints?base=registration', { token: T.so })).data.some((x) => Number(x.CompID) === Number(cid)));

    /* ------------------------------------------------------------ */
    head('C. SCRUTINY (SO)');
    const pre = (await req('get', '/complaints/' + cid + '/scrutiny/prefill', { token: T.so })).data;
    check('prefill has complaint number', pre.cno === createdComp.data.CompNo, pre.cno);
    const save = await req('put', '/complaints/' + cid + '/scrutiny', {
      token: T.so, body: { entityMisconduct: 'e2e entity updated', natureOfAllegation: 'Other', scrutinySheet: { ...pre, q18: 'prima facie opinion' } },
    });
    check('PUT /scrutiny saves sheet + entity', save.status === 200, save.data && save.data.message);
    const spdf = await req('get', '/complaints/' + cid + '/scrutiny/pdf', { token: T.so, raw: true });
    check('scrutiny PDF downloads', spdf.status === 200 && spdf.data.slice(0, 5).toString() === '%PDF-', spdf.data.length + ' bytes');
    check('printable form + compilation render', (await req('get', '/complaints/' + cid + '/form', { token: T.so })).status === 200 && (await req('get', '/complaints/' + cid + '/compilation', { token: T.so })).status === 200);

    /* ------------------------------------------------------------ */
    head('D. WRITTEN STATEMENT + REJOINDER');
    check('SO seeks written statement (status 50)', (await stU(cid, 50, T.so)).status === 200);
    const ws = await req('post', '/complaints/' + cid + '/respondent-response', { token: T.party, body: { kind: 'written', remarks: 'e2e written statement', attachment: relPath } });
    check('respondent submits written statement (status 16)', ws.status === 200, ws.data && ws.data.message);
    check('case is at status 16', Number((await req('get', '/complaints/' + cid, { token: T.so })).data.StatusID) === 16);
    const wsReq = await req('post', '/complaints/' + cid + '/respondent-response', { token: T.party, body: { kind: 'written', remarks: 'again', attachment: relPath } });
    check('duplicate written statement blocked (409)', wsReq.status === 409, 'HTTP ' + wsReq.status);
    check('SO calls for rejoinder (status 22)', (await stU(cid, 22, T.so)).status === 200);
    const rj = await req('post', '/complaints/' + cid + '/complainant-rejoinder', { token: T.party, body: { remarks: 'e2e rejoinder', attachment: relPath } });
    check('complainant submits rejoinder (status 23)', rj.status === 200, rj.data && rj.data.message);
    const rjBad = await req('post', '/complaints/' + cid + '/complainant-rejoinder', { token: T.party, body: { remarks: 'x', attachment: relPath } });
    check('second rejoinder blocked (409)', rjBad.status === 409, 'HTTP ' + rjBad.status);

    /* ------------------------------------------------------------ */
    head('E. CLUBBING RECOMMENDATION CHAIN -> TERMINAL 123');
    check('SO recommends to WO (124)', (await stU(cid, 124, T.so)).status === 200);
    check('WO routes to DD (5)', (await stU(cid, 5, T.wo)).status === 200);
    check('DD places before Committee (69)', (await stU(cid, 69, T.dd)).status === 200);
    check('Committee agrees -> communication to SO (66)', (await stU(cid, 66, T.bod)).status === 200);
    const fin = await req('post', '/complaints/' + cid + '/status', { token: T.so, body: { statusId: 123, remarks: 'e2e: letter communicated', attachment: relPath } });
    check('SO communicates the decision -> terminal 123', fin.status === 200);
    check('case sits at terminal status 123', Number((await req('get', '/complaints/' + cid, { token: T.so })).data.StatusID) === 123);
    const detChain = (await req('get', '/complaints/' + cid, { token: T.so })).data;
    check('timeline 124->5->69->66->123 complete', [124, 5, 69, 66, 123].every((s) => detChain.statusHistory.some((h) => Number(h.StatusID) === s)), (detChain.statusHistory || []).map((h) => h.StatusID).join(','));
    check('clubbing filter includes the case', (await req('get', '/complaints?base=clubbing', { token: T.so })).data.some((x) => Number(x.CompID) === Number(cid)));

    /* ------------------------------------------------------------ */
    head('F. FIRM COMPLAINT + ANSWERABLE MEMBERS');
    const firmEmail = 'firm-' + Date.now() + '@example.invalid';
    created.emails.push(firmEmail);
    const m1email = 'am1-' + Date.now() + '@example.invalid';
    const m2email = 'am2-' + Date.now() + '@example.invalid';
    created.emails.push(m1email, m2email);
    const fp = filePayload(firmEmail, { isFirm: true, nameOfFirm: 'E2E & ASSOCIATES', firmNo: 'F-' + Date.now() });
    const fc = await req('post', '/complaints', { token: T.party, body: fp });
    const fcid = fc.data.CompID;
    check('firm complaint created', fc.status === 201 && fcid, fc.data.CompNo);
    created.comps.push(fcid);
    const am1 = await req('post', '/complaints/' + fcid + '/answerable', {
      token: T.party, body: { memName: 'Member One', memRegistrationNo: '222333', memMobileNo: '9111111111', memEmailID: m1email, memCommStateId: 1, memCommCityId: city.value, memProAddress: 'A1', memCommAddress: 'A2' },
    });
    check('add answerable member #1', am1.status === 200 && am1.data.AMemID, 'AMemID=' + am1.data.AMemID);
    const am2 = await req('post', '/complaints/' + fcid + '/answerable', {
      token: T.party, body: { memName: 'Member Two', memRegistrationNo: '444555', memMobileNo: '9222222222', memEmailID: m2email, memCommStateId: 1, memCommCityId: city.value, memProAddress: 'B1', memCommAddress: 'B2' },
    });
    check('add answerable member #2', am2.status === 200 && am2.data.AMemID, 'AMemID=' + am2.data.AMemID);
    check('duplicate member blocked (409)', (await req('post', '/complaints/' + fcid + '/answerable', { token: T.party, body: { memName: 'X', memRegistrationNo: '222333', memCommStateId: 1, memCommCityId: city.value } })).status === 409);
    const sen = await req('put', '/complaints/' + fcid + '/answerable/' + am1.data.AMemID + '/senior', { token: T.party, body: { senior: 1 } });
    check('mark #1 as signatory', sen.status === 200);
    const fdet = (await req('get', '/complaints/' + fcid, { token: T.so })).data;
    check('detail returns both answerable members + senior flag', (fdet.answerable || []).length === 2 && (fdet.answerable || []).some((a) => Number(a.AMemID) === Number(am1.data.AMemID) && Number(a.IsSenior) === 1));
    // firm written statement: needs BOTH members to reply before advancing
    const tAm1 = await (async () => { const u = (await db.query('SELECT UserID FROM tbl_Users WHERE LOWER(LTRIM(RTRIM(Email)))=@e', { e: m1email.toLowerCase() }))[0]; return tok(Object.assign({}, soU, { UserID: u.UserID, Email: m1email })); })();
    const tAm2 = await (async () => { const u = (await db.query('SELECT UserID FROM tbl_Users WHERE LOWER(LTRIM(RTRIM(Email)))=@e', { e: m2email.toLowerCase() }))[0]; return tok(Object.assign({}, soU, { UserID: u.UserID, Email: m2email })); })();
    check('SO seeks WS on firm case (50)', (await stU(fcid, 50, T.so)).status === 200);
    const fw1 = await req('post', '/complaints/' + fcid + '/respondent-response', { token: tAm1, body: { kind: 'written', remarks: 'member one ws', attachment: relPath } });
    check('first member WS -> pending, case does not advance', fw1.status === 200 && fw1.data.pending === true, JSON.stringify(fw1.data));
    check('case still NOT at 16 after first member', Number((await req('get', '/complaints/' + fcid, { token: T.so })).data.StatusID) !== 16);
    const fw2 = await req('post', '/complaints/' + fcid + '/respondent-response', { token: tAm2, body: { kind: 'written', remarks: 'member two ws', attachment: relPath } });
    check('second member WS finalises -> status 16', fw2.status === 200 && fw2.data.pending !== true, JSON.stringify(fw2.data));
    check('firm case now at 16', Number((await req('get', '/complaints/' + fcid, { token: T.so })).data.StatusID) === 16);
    check('delete answerable member (#2)', (await req('delete', '/complaints/' + fcid + '/answerable/' + am2.data.AMemID + '', { token: T.party })).status === 200);

    /* ------------------------------------------------------------ */
    head('G. AGENDA GENERATION + APPROVAL');
    const ag = await req('post', '/agenda', { token: T.so, body: { items: [{ compId: cid, statusId: 123, date: '2026-10-20', time: '10:30', place: 'Board Room 1' }] } });
    check('POST /agenda generates item', ag.status === 201, JSON.stringify(ag.data.created || []));
    const agList = (await req('get', '/agenda?statusId=123', { token: T.so })).data;
    const agRow = agList.find((a) => Number(a.CompID) === Number(cid));
    check('agenda list contains the new item', !!agRow, 'AjendaID=' + (agRow && agRow.AjendaID));
    if (agRow) {
      check('secretary approves', (await req('post', '/agenda/' + agRow.AjendaID + '/approve', { token: T.so, body: { role: 'secretary', approved: true, remarks: 'ok' } })).status === 200);
      check('PO approves', (await req('post', '/agenda/' + agRow.AjendaID + '/approve', { token: T.dd, body: { role: 'po', approved: true, remarks: 'ok' } })).status === 200);
    }

    /* ------------------------------------------------------------ */
    head('H. HEARING / CAUSE LIST');
    const hg = await req('post', '/hearings', { token: T.bod, body: { compId: cid, causeDate: '2026-11-05', causeTime: '10:30', place: 'Committee Hall', hearingType: '1', statusId: 88 } });
    check('POST /hearings schedules a cause list', hg.status === 201, hg.data && hg.data.message);
    const hlist = (await req('get', '/hearings?compId=' + cid, { token: T.bod })).data;
    const hRow = hlist[0];
    check('hearing list shows the cause list', !!hRow, 'CLID=' + (hRow && hRow.CauseListID));
    if (hRow) {
      const clid = hRow.CauseListID;
      check('party sets online + accepts', (await req('post', '/hearings/' + clid + '/preference', { token: T.party, body: { isRespondent: 0, isOnline: 1, isAccept: 1 } })).status === 200);
      check('respondent accepts offline', (await req('post', '/hearings/' + clid + '/preference', { token: T.party, body: { isRespondent: 1, isOnline: 0, isAccept: 1 } })).status === 200);
      check('add witness', (await req('post', '/hearings/' + clid + '/witnesses', { token: T.bod, body: { wname: 'Mr Witness', waddress: 'W Town', wemail: 'w@example.invalid', wmobile: '9000000000', compId: cid, isRespondant: 0 } })).status === 201);
      check('list witnesses', (await req('get', '/hearings/' + clid + '/witnesses', { token: T.bod })).data.length >= 1);
      if (benchRow) check('record bench attendance', (await req('post', '/hearings/' + clid + '/bench-attendance', { token: T.bod, body: { members: [{ bmID: benchRow.b, isPresent: 1 }] } })).status === 200);
      else console.log('  SKIP  bench attendance (no bench member BMID in DB)');
      check('adjournment requested', (await req('post', '/hearings/' + clid + '/adjourn', { token: T.party, body: { compId: cid, adID: adj.value, remark: 'e2e adjournment', isComp: 0 } })).status === 200);
      check('hearing-type resolves for decisions', (await req('get', '/decisions/hearing-type/' + clid, { token: T.bod })).status === 200);

      head('I. COURT DECISION');
      const dc = await req('post', '/decisions', { token: T.bod, body: { causeListId: clid, meetingNo: 1, presence: 1, presenceDetails: 'All bench members present', direction: 'Direction text e2e', decision: dec.value, attachment: relPath } });
      check('POST /decisions marks a decision', dc.status === 201, dc.data && dc.data.message);
      check('decision history lists it', (await req('get', '/decisions', { token: T.bod })).data.some((d) => Number(d.CauseListID) === Number(clid)));
    }

    /* ------------------------------------------------------------ */
    head('J. STAY ON THE CASE');
    check('mark stay', (await req('post', '/stay/' + cid, { token: T.bod, body: { action: 'put', remarks: 'e2e stay', attachment: relPath } })).status === 200);
    const stayD = (await req('get', '/stay/' + cid, { token: T.bod })).data;
    check('stay history recorded + IsStay=1', Number(stayD.IsStay) === 1 && stayD.history.length >= 1, 'IsStay=' + stayD.IsStay + ' rows=' + stayD.history.length);
    check('remove stay', (await req('post', '/stay/' + cid, { token: T.bod, body: { action: 'remove' } })).status === 200);

    /* ------------------------------------------------------------ */
    head('K. DASHBOARD + REPORTS');
    check('dashboard still renders', (await req('get', '/dashboard', { token: T.so })).status === 200);
    check('BOD dashboard renders', (await req('get', '/dashboard/bod', { token: T.bod })).status === 200);
    for (const b of ['registration', 'actionable', 'nonactionable', 'referring']) check('ageing base=' + b, (await req('get', '/reports/ageing?base=' + b, { token: T.dd })).status === 200);
    check('stage bifurcation', (await req('get', '/reports/stage-bifurcation', { token: T.dd })).status === 200);
    check('complaint status monitor', (await req('get', '/reports/complaint-status?sid=123&type=1', { token: T.dd })).status === 200);

    console.log('\n--- cleanup ---');
  } finally {
    await cleanup();
  }

  const compsLeft = await db.query('SELECT CompID FROM tbl_NewComplaint');
  const clubbingLeft = created.comps.length
    ? (await db.query('SELECT COUNT(*) n FROM tbl_NewComplaint WHERE CompID IN (' + created.comps.join(',') + ')')).map((r) => r.n)[0] : 0;
  check('DB restored - no test complaint left behind', Number(clubbingLeft) === 0, 'remain=' + clubbingLeft);
  check('DB still has the original data', compsLeft.length >= 1, compsLeft.length + ' complaints remain');

  console.log('\n' + '='.repeat(62));
  console.log('LIFECYCLE RESULT:  ' + pass + ' passed,  ' + fail + ' failed');
  if (fails.length) console.log('FAILED: ' + fails.join(' | '));
  console.log('='.repeat(62));
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('HARNESS ERROR:', e && e.stack ? e.stack : e);
  process.exit(2);
});