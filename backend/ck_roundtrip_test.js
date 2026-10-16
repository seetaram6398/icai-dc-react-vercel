const { query, executeNonQuery } = require('./src/config/db');

// Prove that rich-HTML remarks survive the full stack: INSERT -> GET /complaints/:id -> DELETE.
// Uses a throwaway history row on complaint 1211 and removes it afterwards.
(async () => {
  const html = '<p>Line one with <strong>bold</strong> and <em>italic</em> text.</p><ul><li>item A</li><li>item B</li></ul>';
  const marker = 'RICHROUNDTRIP-' + Date.now();
  const remarks = html + '<p>' + marker + '</p>';
  await executeNonQuery(
    `INSERT INTO tbl_ComplaintStatus (CompaintID, StatusID, UserID, UserToID, StatusDate, Remarks)
     VALUES (1211, 4, 1169, NULL, GETDATE(), @remarks)`,
    { remarks }
  );
  const got = await query('SELECT CompStatusID, Remarks FROM tbl_ComplaintStatus WHERE Remarks LIKE @pct', { pct: '%' + marker + '%' });
  if (!got[0]) throw new Error('marker row not found');
  const id = got[0].CompStatusID;
  console.log('stored identical :', got[0].Remarks === remarks);
  console.log(got[0].Remarks);

  // read back through the API exactly like the UI does
  const login = await fetch('http://localhost:5000/api/auth/verify-otp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'seetaram@idiary.in', otp: '123456' }),
  });
  let L = await login.json();
  if (!L.token) {
    await fetch('http://localhost:5000/api/auth/request-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'seetaram@idiary.in' }),
    });
    L = await (await fetch('http://localhost:5000/api/auth/verify-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'seetaram@idiary.in', otp: '123456' }),
    })).json();
    if (!L.token) throw new Error('login failed: ' + JSON.stringify(L));
  }
  const r = await fetch('http://localhost:5000/api/complaints/1211', { headers: { Authorization: 'Bearer ' + L.token } });
  const d = await r.json();
  const row = (d.statusHistory || []).find((h) => Number(h.CompStatusID) === id);
  console.log('API returns rich remarks intact:', !!row && row.Remarks === remarks);
  if (!row) console.log('statusHistory rows:', (d.statusHistory || []).length, 'error-field:', d.error);

  await executeNonQuery('DELETE FROM tbl_ComplaintStatus WHERE CompStatusID=@id', { id });
  console.log('temp row cleaned');
})().catch((e) => { console.error('T:', e.message); process.exitCode = 1; });