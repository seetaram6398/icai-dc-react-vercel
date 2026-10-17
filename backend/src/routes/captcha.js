const express = require('express');
const crypto = require('crypto');
const { authMiddleware } = require('../services/auth');

const router = express.Router();
router.use(authMiddleware);

// Stateless captcha: the "id" is an expiry + HMAC of the (lowercased) answer.
// No server-side storage is needed, so it keeps working across serverless
// instances on Vercel. The answer itself is never sent to the client.
const CAPTCHA_SECRET = process.env.JWT_SECRET || 'ICAI_DC_JWT_SECRET_2026_CHANGE_ME';
const TTL_MS = 5 * 60 * 1000;

function signAnswer(answer, expires) {
  return crypto.createHmac('sha256', CAPTCHA_SECRET).update(`${answer}.${expires}`).digest('hex');
}

function generateCaptchaText(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) result += chars[bytes[i] % chars.length];
  return result;
}

function renderSVG(text) {
  const W = 160, H = 50;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
  svg += `<rect width="${W}" height="${H}" fill="#f0f0f0" rx="4"/>`;
  // noise lines
  for (let i = 0; i < 4; i++) {
    const x1 = Math.random() * W, y1 = Math.random() * H;
    const x2 = Math.random() * W, y2 = Math.random() * H;
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#bbb" stroke-width="1"/>`;
  }
  // noise dots
  for (let i = 0; i < 30; i++) {
    svg += `<circle cx="${Math.random() * W}" cy="${Math.random() * H}" r="1" fill="#999"/>`;
  }
  // text
  for (let i = 0; i < text.length; i++) {
    const x = 15 + i * 22;
    const y = 30 + (Math.random() * 10 - 5);
    const rot = Math.random() * 20 - 10;
    const colors = ['#e74c3c', '#2980b9', '#27ae60', '#8e44ad', '#d35400', '#2c3e50'];
    const color = colors[i % colors.length];
    svg += `<text x="${x}" y="${y}" font-size="22" font-family="monospace" fill="${color}" transform="rotate(${rot} ${x} ${y})">${text[i]}</text>`;
  }
  svg += '</svg>';
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/** GET /api/captcha/generate — returns { id, image } */
router.get('/generate', (req, res) => {
  const text = generateCaptchaText();
  const expires = Date.now() + TTL_MS;
  const id = `${expires}.${signAnswer(text.toLowerCase(), expires)}`;
  res.json({ id, image: renderSVG(text) });
});

/** POST /api/captcha/verify — body: { id, answer } */
router.post('/verify', (req, res) => {
  const { id, answer } = req.body;
  if (!id || !answer) return res.status(400).json({ error: 'Missing captcha id or answer' });

  const [expiresStr, signature] = String(id).split('.');
  const expires = Number(expiresStr);
  if (!expires || !signature) return res.status(400).json({ error: 'Captcha expired' });
  if (expires < Date.now()) return res.status(400).json({ error: 'Captcha expired' });

  const expected = signAnswer(String(answer).trim().toLowerCase(), expires);
  const valid = signature.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) {
    return res.status(400).json({ valid: false, error: 'Invalid captcha' });
  }
  res.json({ valid: true });
});

module.exports = router;
