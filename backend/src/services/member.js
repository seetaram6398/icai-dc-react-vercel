const { query, executeNonQuery } = require('../config/db');

// Credentials/parameters mirrored from Registration.aspx.cs (GetMemberResponse)
const AUTH_URI = 'https://eservices.icai.org/iONBizServices/Authenticate';
const ION_URI = 'https://eservices.icai.org/iONBizServices/iONWebService';
const API_USER = 'disciplinary.api@icai.in';
const API_PASS = 'Disc@123';
const SERVICE_KEY = 'L0HrcS8JHGhx2dEcsBZkMA==';
const FORM_ID = 57499;
const ORG_ID = 1666;

async function getMemberServiceToken() {
  // Reuse cached token if valid within the last 5 minutes (mirrors tbl_Token usage)
  const cached = await query(
    'SELECT TOP 1 token, status, msg FROM tbl_Token WHERE tokentime >= DATEADD(MINUTE, -5, GETDATE()) ORDER BY tokentime DESC'
  );
  if (cached.length && cached[0].token) {
    return { token: cached[0].token, status: cached[0].status, msg: cached[0].msg };
  }

  const body = `usrloginid=${encodeURIComponent(API_USER)}&usrpassword=${encodeURIComponent(API_PASS)}`;
  const xml = await fetch(AUTH_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }).then((r) => r.text());

  const token = xml.match(/TOKENID\s*=\s*["']([^"']+)["']/)?.[1];
  if (!token) throw new Error('Member service auth failed: ' + xml.slice(0, 200));
  const status = xml.match(/STATUS\s*=\s*["']([^"']+)["']/)?.[1] || '0';
  const msg = xml.match(/MSG\s*=\s*["']([^"']+)["']/)?.[1] || '';

  if (status === '1') {
    await executeNonQuery(
      'INSERT INTO tbl_Token (token, tokentime, status, msg) VALUES (@t, GETDATE(), @s, @m)',
      { t: token, s: status, m: msg }
    );
  }
  return { token, status, msg };
}

function buildReadPayload(membershipNo, dobYMD) {
  const requiredFields = [
    { ID: 0, NAME: 'Membership Id' },
    { ID: 1, NAME: 'Applicant Full Name' },
    { ID: 2, NAME: 'Email Id' },
    { ID: 3, NAME: 'Mobile Number' },
    { ID: 4, NAME: 'DOB (dd/MMM/yyyy)' },
    { ID: 5, NAME: 'registrationDate (dd/MMM/yyyy)' },
    { ID: 6, NAME: 'Registration Number' },
    { ID: 7, NAME: 'Permanent City' },
    { ID: 8, NAME: 'Membership Type' },
    { ID: 9, NAME: 'Professional Address Line 1' },
    { ID: 10, NAME: 'Professional Address Line 2' },
    { ID: 11, NAME: 'Professional Address Line 3' },
    { ID: 12, NAME: 'Professional State' },
  ];
  const filters = [
    { FIELD_NAME: 'Membership Id', FIELD_VALUE: membershipNo, OPERATION: 'EQUALS' },
  ];
  if (dobYMD) filters.push({ FIELD_NAME: 'DOB (dd/MMM/yyyy)', FIELD_VALUE: dobYMD, OPERATION: 'EQUALS' });
  return JSON.stringify({
    FORM_ID,
    ORG_ID,
    REQUEST_ACTION: 'READ',
    READ_DATA: {
      NUMBER_OF_RECORDS: 1,
      DATA_OFFSET: 0,
      CUSTOM_FILTERS: { AND_FILTER: { FIELD_FILTER: filters } },
      REQUIRED_FIELDS: requiredFields,
    },
  });
}

/**
 * Look up an ICAI member by Membership No + DOB via the ICAI e-services web service.
 * Returns the member's profile fields exactly as mapped in Registration.aspx.cs:
 * [1]=name [2]=email [3]=mobile [5]=registrationDate [6]=registrationNumber
 * [7]=city [8]=membershipType
 */
async function lookupMember(membershipNo, dobYMD) {
  const { token } = await getMemberServiceToken();
  const payload = buildReadPayload(membershipNo, dobYMD);
  const body = `servicekey=${encodeURIComponent(SERVICE_KEY)}&tokenid=${encodeURIComponent(token)}&requestJsonData=${encodeURIComponent(payload)}`;

  const text = await fetch(ION_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }).then((r) => r.text());

  const json = JSON.parse(text);
  if (json.RESULT !== 'SUCCESS' || !json.SEARCH_RESULTS || !json.SEARCH_RESULTS.RECORDS?.length) {
    const err = new Error('Member not found or invalid DOB');
    err.notFound = true;
    throw err;
  }

  const c = json.SEARCH_RESULTS.RECORDS[0].COLUMNS || [];
  const profAddr = [c[9]?.VALUE, c[10]?.VALUE, c[11]?.VALUE].filter(Boolean).join(' ');
  return {
    name: c[1]?.VALUE || '',
    email: c[2]?.VALUE || '',
    mobile: c[3]?.VALUE || '',
    registrationDate: c[5]?.VALUE || '',
    registrationNumber: c[6]?.VALUE || '',
    city: c[7]?.VALUE || '',
    membershipType: c[8]?.VALUE || '',
    professionalAddress: profAddr,
    professionalState: c[12]?.VALUE || '',
  };
}

module.exports = { lookupMember };