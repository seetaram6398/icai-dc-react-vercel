const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { put } = require('@vercel/blob');
const { handleUpload } = require('@vercel/blob/client');
const { authMiddleware, verifyToken } = require('../services/auth');

const router = express.Router();

// Define upload destination mapping for document types
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
};

const DOC_ROOT = path.join(__dirname, '..', '..', '..', 'Documents');

// On Vercel the filesystem is read-only, so uploads go to Vercel Blob and the
// local Documents folder is only used when running standalone (dev / VM).
const ON_VERCEL = !!process.env.VERCEL;
const BLOB_ENABLED = !!process.env.BLOB_READ_WRITE_TOKEN;
const PDF_ONLY_TYPES = new Set(['ddtoSO', 'respondent']);
// Vercel Functions reject request bodies larger than 4.5 MB; larger files use
// the browser -> Vercel Blob client-upload flow below instead.
const MAX_FUNCTION_BYTES = ON_VERCEL ? 4 * 1024 * 1024 : 20 * 1024 * 1024;
const MAX_CLIENT_BYTES = 20 * 1024 * 1024;

function uniqueFilename(originalname) {
  const ext = path.extname(originalname || '');
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
}

function pdfOnlyError(type, originalname) {
  if (!PDF_ONLY_TYPES.has(type)) return null;
  if (path.extname(originalname || '').toLowerCase() === '.pdf') return null;
  return type === 'ddtoSO'
    ? 'Only PDF files are supported for DD to SO attachments'
    : 'Only PDF files are supported for respondent replies';
}

/**
 * Client (browser -> Vercel Blob) upload token exchange.
 * The @vercel/blob client SDK posts JSON without our Authorization header, so
 * the JWT travels inside clientPayload and is verified here.
 */
async function clientUploadHandler(req, res) {
  const body = req.body || {};
  let meta = {};
  try {
    meta = JSON.parse((body.payload && body.payload.clientPayload) || '{}');
  } catch (e) {
    meta = {};
  }
  if (!verifyToken(meta.token)) return res.status(401).json({ error: 'Not authenticated' });
  if (!BLOB_ENABLED) {
    return res.status(500).json({ error: 'File storage is not configured on the server (BLOB_READ_WRITE_TOKEN missing)' });
  }
  const type = meta.type || 'other';
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const dir = UPLOAD_DIRS[type] || 'OtherCompDoc';
        if (!pathname.startsWith(`${dir}/`)) throw new Error('Invalid upload path');
        return {
          addRandomSuffix: false,
          maximumSizeInBytes: MAX_CLIENT_BYTES,
          allowedContentTypes: PDF_ONLY_TYPES.has(type) ? ['application/pdf'] : undefined,
        };
      },
    });
    res.json(json);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

// Buffer uploads in memory: the type field is parsed before the handler runs,
// and on Vercel the temp/final folders do not exist anyway.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FUNCTION_BYTES } });

router.post('/', (req, res, next) => {
  if ((req.headers['content-type'] || '').includes('application/json')) {
    return clientUploadHandler(req, res);
  }
  next();
});

/**
 * POST /api/upload
 * Single file upload. Multipart: field 'file', formData 'type' to choose folder.
 * Small files go through this function; large files use the client-upload route
 * above (same URL, JSON body) to bypass the 4.5 MB serverless body limit.
 * Returns { filename, path, relativePath }
 */
router.post('/', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const type = (req.body && req.body.type) || req.query.type || 'other';
  const invalid = pdfOnlyError(type, req.file.originalname);
  if (invalid) return res.status(400).json({ error: invalid });

  const dir = UPLOAD_DIRS[type] || 'OtherCompDoc';
  const filename = uniqueFilename(req.file.originalname);
  const relativePath = `${dir}/${filename}`;

  if (ON_VERCEL || BLOB_ENABLED) {
    if (!BLOB_ENABLED) {
      return res.status(500).json({ error: 'File storage is not configured on the server (BLOB_READ_WRITE_TOKEN missing)' });
    }
    try {
      await put(relativePath, req.file.buffer, {
        access: 'public',
        contentType: req.file.mimetype,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      return res.json({ filename, path: filename, relativePath });
    } catch (e) {
      console.error('blob upload error:', e);
      return res.status(500).json({ error: 'File upload failed' });
    }
  }

  // Local dev / VM: write into the Documents folder served by /documents.
  try {
    const full = path.join(DOC_ROOT, dir);
    fs.mkdirSync(full, { recursive: true });
    fs.writeFileSync(path.join(full, filename), req.file.buffer);
    res.json({ filename, path: filename, relativePath });
  } catch (e) {
    console.error('upload write error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    const limitMB = Math.round(MAX_FUNCTION_BYTES / (1024 * 1024));
    return res.status(400).json({
      error: err.code === 'limits.fileSize' ? `File size should be less than ${limitMB}MB` : err.message,
    });
  }
  next(err);
});

module.exports = router;
