const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');

const db = require('./config/db');
const { verifyToken } = require('./services/auth');
const { resolveDocumentPath } = require('./services/documents');

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await db.executeScalar('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (e) {
    res.status(500).json({ status: 'error', db: 'disconnected', error: e.message });
  }
});

// API routes (all JWT-protected via authMiddleware, except /api/auth login flow)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/masters', require('./routes/masters'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/agenda', require('./routes/agenda'));
app.use('/api/hearings', require('./routes/hearings'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/decisions', require('./routes/decisions'));
app.use('/api/stay', require('./routes/stay'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/master-data', require('./routes/masterData'));
app.use('/api/captcha', require('./routes/captcha'));

// Documents — requires a valid token via Authorization header or the icai_token session cookie
// (browser <a href="/documents/..."> clicks only send the cookie).
function documentAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ') && verifyToken(header.slice(7))) return next();
  const cookie = req.cookies && req.cookies.icai_token;
  if (cookie && verifyToken(cookie)) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}
app.use('/documents', documentAuth, (req, res, next) => {
  const resolved = resolveDocumentPath(req.path.replace(/^\/+/, ''));
  if (!resolved) return res.status(404).json({ error: 'Document not found' });
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(resolved.abs);
});

// ================= Frontend SPA (server-side protected) =================
// On Vercel the built SPA is served as static assets from the CDN and only
// /api/* and /documents/* are routed to this function, so the SPA handling
// below is only needed when this server runs standalone (local dev / VM).
if (!process.env.VERCEL) {
  const DIST_DIR = path.join(__dirname, '..', '..', 'frontend', 'dist');
  const PUBLIC_PATHS = ['/login', '/register'];

  // Static build assets (JS/CSS/images) are served without auth — they contain no data.
  app.use(express.static(DIST_DIR, { index: false }));

  // Every other page requires a valid session cookie, otherwise redirect to /login.
  app.get('*', (req, res, next) => {
    if (PUBLIC_PATHS.includes(req.path)) return next();
    const token = req.cookies && req.cookies.icai_token;
    if (!token || !verifyToken(token)) {
      return res.redirect('/login');
    }
    next();
  }, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

// 404 handler for unknown API routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// On Vercel the exported app is invoked as a serverless function; only start a
// long-running listener when running standalone (local dev / VM / container).
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`ICAI DC Backend listening on port ${PORT}`);
  });
}

module.exports = app;