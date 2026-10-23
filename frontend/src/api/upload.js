import api from './client';

// Must stay in sync with UPLOAD_DIRS in backend/src/routes/upload.js
const UPLOAD_DIRS = {
  aadhar: 'Aadhar',
  photo: 'ComplaintantPhoto',
  signature: 'ComplaintantSignature',
  brief: 'Brief',
  misconduct: 'Misconduct',
  investreport: 'InvestingReport',
  other: 'OtherCompDoc',
  audiovideo: 'AudioVideo',
  digicert: 'DigitalEvidenceCertificate',
  regulator: 'Regulator',
  ddtoSO: 'DDTOSO',
  causelist: 'CauseList',
  decision: 'Decision',
  stay: 'StayAttach',
  soaction: 'SOAction',
  respondent: 'RespondentReply',
  withdrawal: 'Withdrawal',
  workflow: 'Workflow',
};

// Vercel Functions reject request bodies larger than 4.5 MB, so anything
// bigger is uploaded straight from the browser to Vercel Blob.
const MAX_FUNCTION_UPLOAD = 4 * 1024 * 1024;

function uniqueFilename(name) {
  const i = (name || '').lastIndexOf('.');
  const ext = i > 0 ? name.slice(i) : '';
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
}

/**
 * Upload a file and resolve to the same { filename, path, relativePath } shape
 * the /api/upload endpoint returns. Files above the serverless body limit go
 * directly to Vercel Blob; everything else posts through the backend.
 */
export async function uploadFile(file, type = 'other') {
  const dir = UPLOAD_DIRS[type] || 'OtherCompDoc';
  if (file.size > MAX_FUNCTION_UPLOAD) {
    try {
      const { upload } = await import('@vercel/blob/client');
      const filename = uniqueFilename(file.name);
      await upload(`${dir}/${filename}`, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
        clientPayload: JSON.stringify({ type, token: localStorage.getItem('icai_token') || '' }),
      });
      return { filename, path: filename, relativePath: `${dir}/${filename}` };
    } catch (e) {
      // Blob not configured (e.g. local dev) — fall back to the server upload.
    }
  }
  const fd = new FormData();
  fd.append('file', file);
  fd.append('type', type);
  const { data } = await api.post('/upload', fd);
  return data;
}
