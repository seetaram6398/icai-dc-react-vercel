const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: Number(process.env.EMAIL_PORT || 587),
      secure: String(process.env.EMAIL_SECURE || '').toLowerCase() === 'true',
      auth: { user, pass },
    });
  }
  return transporter;
}

/**
 * Send an email.
 * @param {string} to recipient
 * @param {string} subject subject line
 * @param {string} html HTML body
 * @param {Array<{filename?: string, content?: Buffer, path?: string}>} [attachments]
 * @returns {Promise<boolean>} true when handed to SMTP, false when e-mail is not configured
 */
async function sendMail(to, subject, html, attachments = []) {
  const recipient = String(to || '').trim();
  if (!recipient) {
    console.warn('sendMail skipped: no recipient');
    return false;
  }
  const mailer = getTransporter();
  if (!mailer) {
    console.warn(`sendMail skipped (SMTP not configured): to=${recipient} subject="${subject}"`);
    return false;
  }

  // Test/demo switch: route every message to a single mailbox instead of the
  // real user/respondent. The original recipient stays visible in the header.
  const redirectTo = String(process.env.MAIL_REDIRECT_TO || '').trim();
  const actualTo = redirectTo || recipient;

  await mailer.sendMail({
    from: `"ICAI Disciplinary Directorate" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
    to: actualTo,
    replyTo: redirectTo ? recipient : undefined,
    subject,
    html: redirectTo
      ? `<p style="font-family:Arial,sans-serif;color:#666;font-size:12px">Original recipient: ${recipient}</p>${html}`
      : html,
    headers: redirectTo ? { 'X-Original-To': recipient } : undefined,
    attachments,
  });
  if (redirectTo) console.log(`sendMail redirected: ${recipient} -> ${actualTo}`);
  return true;
}

/** Send OTP email for login/registration. */
async function sendOTPEmail(to, otp) {
  const html = `
    <div style="font-family:Arial,sans-serif;padding:20px;max-width:500px;margin:auto;border:1px solid #eee;border-radius:8px">
      <h2 style="color:#003366">ICAI Disciplinary Directorate</h2>
      <p>Dear User,</p>
      <p>Your One-Time Password (OTP) for login is:</p>
      <div style="font-size:28px;font-weight:bold;letter-spacing:8px;background:#f5f7fa;padding:16px;text-align:center;border-radius:6px;margin:16px 0">${otp}</div>
      <p>This OTP is valid for 5 minutes. Please do not share it with anyone.</p>
      <p>Regards,<br/>ICAI Disciplinary Directorate</p>
    </div>`;
  return sendMail(to, 'ICAI Disciplinary Directorate - Login OTP', html);
}

module.exports = { sendMail, sendOTPEmail };
