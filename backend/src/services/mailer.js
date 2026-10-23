// const nodemailer = require('nodemailer');

// let transporter = null;

// function getTransporter() {
//   if (!transporter) {
//     transporter = nodemailer.createTransport({
//       host: process.env.EMAIL_HOST || 'smtp.gmail.com',
//       port: Number(process.env.EMAIL_PORT || 587),
//       secure: false,
//       auth: {
//         user: process.env.EMAIL_USER,
//         pass: process.env.EMAIL_PASS,
//       },
//     });
//   }
//   return transporter;
// }

/**
 * Send an email.
 * @param {string} to recipient
 * @param {string} subject subject line
 * @param {string} html HTML body
 * @returns {Promise<boolean>}
 */
async function sendMail(to, subject, html) {
  return true;
  // try {
  //   const mailer = getTransporter();
  //   if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  //     await mailer.sendMail({
  //       from: `"ICAI Disciplinary Directorate" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
  //       to,
  //       subject,
  //       html,
  //     });
  //   }
  //   return true;
  // } catch (e) {
  //   console.error('Email send failed:', e.message);
  //   throw new Error('Email sending failed');
  // }
}

/** Send OTP email for login/registration. */
async function sendOTPEmail(to, otp) {
  // const html = `
  //   <div style="font-family:Arial,sans-serif;padding:20px;max-width:500px;margin:auto;border:1px solid #eee;border-radius:8px">
  //     <h2 style="color:#003366">ICAI Disciplinary Directorate</h2>
  //     <p>Dear User,</p>
  //     <p>Your One-Time Password (OTP) for login is:</p>
  //     <div style="font-size:28px;font-weight:bold;letter-spacing:8px;background:#f5f7fa;padding:16px;text-align:center;border-radius:6px;margin:16px 0">${otp}</div>
  //     <p>This OTP is valid for 5 minutes. Please do not share it with anyone.</p>
  //     <p>Regards,<br/>ICAI Disciplinary Directorate</p>
  //   </div>`;
  // return sendMail(to, 'ICAI Disciplinary Directorate - Login OTP', html);
  return true;
}

module.exports = { sendMail, sendOTPEmail };
