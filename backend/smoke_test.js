/* eslint-disable */
// Broad smoke test: signs JWTs for every role (OTP is fixed to 123456, so no
// mail is needed) and exercises every GET endpoint plus the captcha flow and a
// full registration -> verify round trip. Read-only: no complaint rows change.
process.chdir(__dirname);
require('dotenv').config();
const db = require('./src/config/db');
const jwt = require('jsonwebtoken');

const API = 'http://localhost:5000/api';
const SECRET = process.env.JWT_SECRET || 'ICAI_DC_JWT_SECRET_2026_CHANGE_ME';

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '  [' + extra + ']' : '')); }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (extra ? '  [' + extra + ']' : '')); }
}
const head = (t) => console.log('\n=== ' + t + ' ' + '='.repeat(Math.max(0, 56 - t.length)));

async function req(method, url, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
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
  const users = await db.query('SELECT UserID, UserType, NameOfTheUser, LoginID, MembershipNo, Email FROM tbl_Users WHERE IsDeactivated=0');
  const pick = (ut) => users.find((u) => Number(u.UserType) === ut);
  const roles = { complainant: 1, member: 2, party: 3, dd: 4, so: 5, bod: 6, officer: 7, regulator: 8, cae: 11, wo: 13 };
  const T = {};
  for (const [name, ut] of Object.entries(roles)) {
    const u = pick(ut);
    if (u) T[name] = tok(u);
  }
  const T_ANY = T.bod || T.so || tok(users[0]);
  console.log('roles with accounts: ' + Object.keys(T).join(', '));

  const anyComp = (await db.query('SELECT TOP 1 CompID FROM tbl_NewComplaint ORDER BY CompID DESC'))[0];
  const cid = anyComp ? anyComp.CompID : null;

  head('HEALTH + AUTH');
  {
    const h = await req('get', '/health');
    check('GET /health', h.status === 200 && h.data.db === 'connected', JSON.stringify(h.data));
    check('GET /auth/me (bod)', (await req('get', '/auth/me', { token: T_ANY })).status === 200);
    check('GET /auth/me anonymous blocked', (await req('get', '/auth/me')).status === 401);
  }

  head('CAPTCHA (used by the authenticated FileComplaint page)');
  {
    const g = await req('get', '/captcha/generate', { token: T_ANY });
    check('GET /captcha/generate', g.status === 200 && g.data && g.data.id && g.data.image, 'HTTP ' + g.status);
    const v = await req('post', '/captcha/verify', { token: T_ANY, body: { id: g.data.id, answer: 'wrong-answer' } });
    check('POST /captcha/verify rejects a wrong answer', v.status === 400, 'HTTP ' + v.status);
    const g2 = await req('get', '/captcha/generate', { token: T_ANY });
    check('GET /captcha/generate anonymous blocked', (await req('get', '/captcha/generate')).status === 401);
  }

  head('MASTERS (types 1..32)');
  {
    for (let type = 1; type <= 32; type++) {
      const r = await req('get', '/masters/' + type, { token: T_ANY });
      check('masters/' + type, r.status === 200 && Array.isArray(r.data), 'rows=' + (Array.isArray(r.data) ? r.data.length : 'n/a') + ' HTTP ' + r.status);
    }
    const dep = await req('get', '/masters/7?option1=1', { token: T_ANY });
    check('masters/7 depends on option1 (cities)', dep.status === 200 && Array.isArray(dep.data), 'rows=' + (dep.data || []).length);
  }

  head('DASHBOARD');
  for (const p of ['', '/bod', '/member']) {
    const r = await req('get', '/dashboard' + p, { token: T_ANY });
    check('GET /dashboard' + p, r.status === 200, 'HTTP ' + r.status + ' ' + (r.status !== 200 ? JSON.stringify(r.data).slice(0, 80) : ''));
  }

  head('COMPLAINTS');
  {
    const list = await req('get', '/complaints', { token: T_ANY });
    check('GET /complaints', list.status === 200, 'rows=' + (list.data || []).length);
    for (const b of ['registration', 'actionable', 'nonactionable', 'referring', 'clubbing']) {
      const r = await req('get', '/complaints?base=' + b, { token: T_ANY });
      check('GET /complaints?base=' + b, r.status === 200, 'rows=' + (r.data || []).length);
    }
    const exp = await req('get', '/complaints/export', { token: T_ANY, raw: true });
    check('GET /complaints/export', exp.status === 200, exp.data.length + ' bytes');
    const se = await req('get', '/complaints/search?q=PR&self=0', { token: T_ANY });
    check('GET /complaints/search', se.status === 200 && Array.isArray(se.data), 'rows=' + (se.data || []).length);
    if (cid) {
      const d = await req('get', '/complaints/' + cid, { token: T_ANY });
      check('GET /complaints/:id', d.status === 200 && d.data.CompID, 'HTTP ' + d.status);
      const f = await req('get', '/complaints/' + cid + '/form', { token: T_ANY, raw: true });
      check('GET /complaints/:id/form', f.status === 200 && String(f.data).length > 0, f.data.length + ' bytes');
      const cp = await req('get', '/complaints/' + cid + '/compilation', { token: T_ANY, raw: true });
      check('GET /complaints/:id/compilation', cp.status === 200, cp.data.length + ' bytes');
      const pf = await req('get', '/complaints/' + cid + '/form/pdf', { token: T_ANY, raw: true });
      check('GET /complaints/:id/form/pdf', pf.status === 200 && pf.data.slice(0, 5).toString() === '%PDF-', pf.data.length + ' bytes');
      const pc = await req('get', '/complaints/' + cid + '/compilation/pdf', { token: T_ANY, raw: true });
      check('GET /complaints/:id/compilation/pdf', pc.status === 200 && pc.data.slice(0, 5).toString() === '%PDF-', pc.data.length + ' bytes');
      const sp = await req('get', '/complaints/' + cid + '/scrutiny/prefill', { token: T_ANY });
      check('GET /complaints/:id/scrutiny/prefill', sp.status === 200, 'HTTP ' + sp.status);
      const spdf = await req('get', '/complaints/' + cid + '/scrutiny/pdf', { token: T_ANY, raw: true });
      check('GET /complaints/:id/scrutiny/pdf', spdf.status === 200 && spdf.data.slice(0, 5).toString() === '%PDF-', spdf.data.length + ' bytes');
    } else check('a complaint exists to test detail routes', false);
  }

  head('AGENDA / HEARINGS / DECISIONS / STAY');
  check('GET /agenda', (await req('get', '/agenda', { token: T_ANY })).status === 200);
  check('GET /agenda?statusId=2', (await req('get', '/agenda?statusId=2', { token: T_ANY })).status === 200);
  check('GET /hearings', (await req('get', '/hearings', { token: T_ANY })).status === 200);
  check('GET /hearings?type=punishment', (await req('get', '/hearings?type=punishment', { token: T_ANY })).status === 200);
  check('GET /decisions', (await req('get', '/decisions', { token: T_ANY })).status === 200);
  check('GET /stay/search', (await req('get', '/stay/search?q=PR', { token: T_ANY })).status === 200);
  if (cid) check('GET /stay/:compId', (await req('get', '/stay/' + cid, { token: T_ANY })).status === 200);
  check('GET /master-data/boards', (await req('get', '/master-data/boards', { token: T_ANY })).status === 200);

  head('REPORTS');
  for (const b of ['registration', 'actionable', 'nonactionable', 'referring']) {
    const r = await req('get', '/reports/ageing?base=' + b, { token: T_ANY });
    check('reports/ageing base=' + b, r.status === 200, 'rows=' + (r.data || []).length);
  }
  check('reports/stage-bifurcation?view=stages', (await req('get', '/reports/stage-bifurcation?view=stages', { token: T_ANY })).status === 200);
  check('reports/stage-bifurcation?view=formType', (await req('get', '/reports/stage-bifurcation?view=formType', { token: T_ANY })).status === 200);
  const cs = await req('get', '/reports/complaint-status?sid=2&type=1', { token: T_ANY });
  check('reports/complaint-status?sid=2&type=1', cs.status === 200, 'rows=' + (cs.data || []).length);
  check('reports/member-ageing', (await req('get', '/reports/member-ageing', { token: T_ANY })).status === 200);
  const mcs = await req('get', '/reports/member-complaint-status?sid=2&type=1', { token: T_ANY });
  check('reports/member-complaint-status?sid=2&type=1', mcs.status === 200, 'rows=' + (mcs.data || []).length);
  check('reports/payment-details', (await req('get', '/reports/payment-details', { token: T_ANY })).status === 200);

  head('AUTH REGISTER FLOW (round trip, then cleanup)');
  {
    const email = 'smoke-' + Date.now() + '@example.invalid';
    const reg = await req('post', '/auth/register', { body: { name: 'Smoke Test', email, mobile: '9999999999', isICAIMember: false } });
    check('POST /auth/register', reg.status === 200 && reg.data.otp, 'HTTP ' + reg.status + ' otp=' + reg.data.otp);
    const vr = await req('post', '/auth/verify-registration', { body: { email, otp: reg.data.otp } });
    check('POST /auth/verify-registration', vr.status === 200 && vr.data.token, 'HTTP ' + vr.status);
    // cleanup the throwaway account
    await db.executeNonQuery("DELETE FROM tbl_Users WHERE Email=@e AND NameOfTheUser='Smoke Test'", { e: email });
  }

  console.log('\n' + '='.repeat(62));
  console.log('SMOKE RESULT:  ' + pass + ' passed,  ' + fail + ' failed');
  if (fails.length) console.log('FAILED: ' + fails.join(' | '));
  console.log('='.repeat(62));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
