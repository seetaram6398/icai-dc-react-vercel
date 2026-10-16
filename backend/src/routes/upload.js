const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware } = require('../services/auth');

const router = express.Router();
router.use(authMiddleware);

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

// Multer's destination() runs before text fields that arrive AFTER the file
// in the multipart stream are parsed, so req.body.type may be empty there.
// Buffer into a temp dir and move to the type folder after parsing.
const TMP_DIR = path.join(__dirname, '..', '..', '..', 'TheTemp');

const storage = multer.diskStorage({
  destination(req, file, cb) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    cb(null, TMP_DIR);
  },
  filename(req, file, cb) {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

/**
 * POST /api/upload
 * Single file upload. Multipart: field 'file', formData 'type' to choose folder.
 * Returns { filename, path }
 */
router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const type = (req.body && req.body.type) || req.query.type || 'other';
    if (type === 'ddtoSO' && path.extname(req.file.originalname).toLowerCase() !== '.pdf') {
      fs.rmSync(req.file.path, { force: true });
      return res.status(400).json({ error: 'Only PDF files are supported for DD to SO attachments' });
    }
    if (type === 'respondent' && path.extname(req.file.originalname).toLowerCase() !== '.pdf') {
      fs.rmSync(req.file.path, { force: true });
      return res.status(400).json({ error: 'Only PDF files are supported for respondent replies' });
    }
    const dir = UPLOAD_DIRS[type] || 'OtherCompDoc';
    const full = path.join(DOC_ROOT, dir);
    fs.mkdirSync(full, { recursive: true });
    const finalPath = path.join(full, req.file.filename);
    fs.renameSync(req.file.path, finalPath);
    const relativePath = `${dir}/${req.file.filename}`;
    res.json({ filename: req.file.filename, path: req.file.filename, relativePath });
  } catch (e) {
    console.error('upload move error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
