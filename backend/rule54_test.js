const BASE = 'http://localhost:5000/api';

const j = (r) => r.json().catch(() => ({}));
const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });

async function main() {
  await fetch(`${BASE}/auth/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'seetaram@idiary.in' }),
  });
  const login = await j(
    await fetch(`${BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'seetaram@idiary.in', otp: '123456' }),
    })
  );
  const t = login.token;
  if (!t) return console.log('FAIL login', JSON.stringify(login));
  console.log('OK  login, user', login.user?.UserType);

  // 1. previous-complaint search
  let r = await fetch(`${BASE}/complaints/search?q=PR&self=999`, { headers: H(t) });
  let rows = await j(r);
  console.log(r.status === 200 ? `OK  search (${rows.length} rows)` : 'FAIL search', rows[0] && rows[0].CompNo);

  r = await fetch(`${BASE}/complaints/search?q=x`, { headers: H(t) });
  rows = await j(r);
  console.log(Array.isArray(rows) && rows.length === 0 ? 'OK  search short query -> []' : 'FAIL search short query', rows);

  if (!Array.isArray(rows)) return;
  // pick two distinct complaints
  const all = [];
  for (const q of ['12', '20', 'a', 'e']) {
    const rr = await j(await fetch(`${BASE}/complaints/search?q=${q}&self=0`, { headers: H(t) }));
    for (const row of rr || []) if (!all.find((x) => x.CompID === row.CompID)) all.push(row);
  }
  if (all.length < 1) return console.log('FAIL need a complaint');
  const self = all[0];
  const prev = all[0]; // only one complaint exists in this DB - link it to itself
  console.log('using complaint', self.CompID, self.CompNo, 'status', self.StatusID);

  // self must be excluded from the previous-complaint list
  r = await fetch(`${BASE}/complaints/search?q=PR&self=${self.CompID}`, { headers: H(t) });
  rows = await j(r);
  console.log(Array.isArray(rows) && rows.length === 0 ? 'OK  self excluded from search' : 'FAIL self excluded', rows.length);

  // 2. detail returns the new clubbing fields
  r = await fetch(`${BASE}/complaints/${self.CompID}`, { headers: H(t) });
  let d = await j(r);
  const hasKeys = ['ClubbedWithCompID', 'ClubRule', 'ClubbedWithCompNo', 'ClubbedWithComplainant', 'ClubbedWithStatusName'].every(
    (k) => Object.prototype.hasOwnProperty.call(d, k)
  );
  console.log(hasKeys ? 'OK  detail has clubbing fields' : 'FAIL detail missing clubbing fields', {
    ClubbedWithCompID: d.ClubbedWithCompID,
    ClubbedWithCompNo: d.ClubbedWithCompNo,
  });

  // 3. link it to the previous complaint through the status route
  const statusId = Number(d.StatusID);
  r = await fetch(`${BASE}/complaints/${self.CompID}/status`, {
    method: 'POST',
    headers: H(t),
    body: JSON.stringify({
      statusId,
      remarks: 'rule54 test - link previous complaint',
      clubbedWithCompId: Number(prev.CompID),
      clubRule: 'A',
    }),
  });
  console.log(r.status === 200 ? 'OK  status POST with clubbedWithCompId' : 'FAIL status POST', await j(r));

  r = await fetch(`${BASE}/complaints/${self.CompID}`, { headers: H(t) });
  d = await j(r);
  console.log(
    Number(d.ClubbedWithCompID) === Number(prev.CompID) && d.ClubRule === 'A'
      ? 'OK  link stored + resolved'
      : 'FAIL link',
    { ClubbedWithCompID: d.ClubbedWithCompID, ClubRule: d.ClubRule, ClubbedWithCompNo: d.ClubbedWithCompNo }
  );

  // 4. unlink (Rule 5(4)(b)/(c) "deal with it as a separate complaint")
  r = await fetch(`${BASE}/complaints/${self.CompID}/status`, {
    method: 'POST',
    headers: H(t),
    body: JSON.stringify({ statusId, remarks: 'rule54 test - unlink', clubbedWithCompId: null }),
  });
  d = await j(await fetch(`${BASE}/complaints/${self.CompID}`, { headers: H(t) }));
  console.log(r.status === 200 && d.ClubbedWithCompID == null ? 'OK  unlink' : 'FAIL unlink', {
    ClubbedWithCompID: d.ClubbedWithCompID,
  });

  // 5. statuses 125-130 exist in the master used by the filters
  r = await fetch(`${BASE}/masters/12`, { headers: H(t) });
  rows = await j(r);
  const ids = (rows || []).map((x) => Number(x.value));
  const need = [125, 126, 127, 128, 129, 130];
  console.log(need.every((n) => ids.includes(n)) ? 'OK  statuses 125-130 in master' : 'FAIL statuses missing', need.filter((n) => !ids.includes(n)));
}

main().catch((e) => console.log('ERROR', e));
