const nodemailer = require('nodemailer');

let transporter = null;

// Lazily build the SMTP transporter — safe to call repeatedly
function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('⚠️  SMTP not configured — email sending disabled');
    return null;
  }

  transporter = nodemailer.createTransport({
    host:   SMTP_HOST,
    port:   parseInt(SMTP_PORT) || 587,
    secure: parseInt(SMTP_PORT) === 465,
    auth:   { user: SMTP_USER, pass: SMTP_PASS }
  });

  return transporter;
}

async function sendEmail({ to, subject, html, attachments }) {
  const mailer = getTransporter();
  if (!mailer) return { sent: false, reason: 'SMTP not configured' };

  try {
    await mailer.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
      attachments
    });
    return { sent: true };
  } catch (err) {
    console.error('Email send failed:', err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendEmail };
