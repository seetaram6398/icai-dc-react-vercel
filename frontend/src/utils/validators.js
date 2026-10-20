// Shared field-validation helpers for forms.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(v) {
  return EMAIL_RE.test(String(v || '').trim());
}

export function sanitizeDigits(v, max = 15) {
  return String(v || '').replace(/\D/g, '').slice(0, max);
}

// countryCode '91' (India) => exactly 10 digits starting 6-9; others 6-14 digits.
export function isValidMobile(v, countryCode = '91') {
  const d = String(v || '').replace(/\D/g, '');
  if (String(countryCode) === '91') return /^[6-9]\d{9}$/.test(d);
  return /^\d{6,14}$/.test(d);
}

export function isValidPincode(v) {
  return /^\d{6}$/.test(String(v || '').trim());
}

export function isValidStdCode(v) {
  return /^\d{2,4}$/.test(String(v || '').trim());
}

export function isValidLandline(v) {
  return /^\d{6,8}$/.test(String(v || '').trim());
}

// PAN as per Income Tax structure:
//   chars 1-3  : alphabetic series (AAA-ZZZ)
//   char  4    : holder status — P=Individual, F=Firm/LLP, C=Company, H=HUF,
//                A=AOP, B=BOI, G=Government, L=Local authority,
//                J=Artificial juridical person, T=Trust, K=legacy KYC
//   char  5    : first letter of surname / name
//   chars 6-9  : 4 digits
//   char  10   : alphabetic series character
export function isValidPan(v) {
  return /^[A-Z]{3}[PCHFATBLJGK][A-Z][0-9]{4}[A-Z]$/.test(String(v || '').trim().toUpperCase());
}

// Aadhaar: 12 digits
export function isValidAadhaar(v) {
  return /^\d{12}$/.test(String(v || '').replace(/\s/g, ''));
}

// GSTIN: 15 chars, e.g. 22AAAAA0000A1Z5
export function isValidGstin(v) {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(v || '').trim().toUpperCase());
}

export function sanitizeAlphaNumUpper(v, max = 20) {
  return String(v || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, max);
}

export function sanitizeUpper(v, max = 30) {
  return String(v || '').toUpperCase().slice(0, max);
}

// Person/individual name: starts with a letter; letters, spaces, . ' - only
export function isValidName(v) {
  return /^[A-Za-z][A-Za-z .'\-]{1,99}$/.test(String(v || '').trim());
}

// Firm / company name: may also contain digits and & ( ) , /
export function isValidFirmName(v) {
  return /^[A-Za-z0-9][A-Za-z0-9 .&()'\\/-]{1,99}$/.test(String(v || '').trim());
}

// Date input (yyyy-mm-dd) that falls after today
export function isFutureDate(v) {
  if (!v) return false;
  const d = new Date(v);
  const t = new Date();
  if (Number.isNaN(d.getTime())) return false;
  d.setHours(0, 0, 0, 0);
  t.setHours(0, 0, 0, 0);
  return d > t;
}

// yyyy-mm-dd comparison: a <= b
export function isDateRangeOk(from, to) {
  if (!from || !to) return false;
  return new Date(from) <= new Date(to);
}
