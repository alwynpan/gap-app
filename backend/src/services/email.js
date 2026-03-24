const nodemailer = require('nodemailer');
const config = require('../config/index');

let _transporter = null;

function getTransporter() {
  if (_transporter) {
    return _transporter;
  }
  const { host, port, secure, user, pass } = config.smtp;
  if (!host) {
    return null;
  }
  _transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });
  return _transporter;
}

async function sendEmail(to, subject, html) {
  const transporter = getTransporter();
  if (!transporter) {
    // SMTP not configured — log to console so dev flows (password setup/reset) remain usable
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[EMAIL DEV] To: ${to} | Subject: ${subject}`); // eslint-disable-line no-console
      console.log('[EMAIL DEV] Body:', html); // eslint-disable-line no-console
    } else {
      console.warn('[EMAIL] SMTP not configured; email not sent.'); // eslint-disable-line no-console
    }
    return;
  }
  await transporter.sendMail({ from: config.smtp.from, to, subject, html });
}

async function sendPasswordSetupEmail(user, token) {
  const url = `${config.appUrl}/set-password?token=${token}`;
  const name = user.first_name || user.username;
  await sendEmail(
    user.email,
    'Set your password — G.A.P. Portal',
    `<p>Hello ${name},</p>
<p>Your G.A.P. Portal account has been created. Please click the link below to set your password:</p>
<p><a href="${url}">${url}</a></p>
<p>This link expires in 24 hours.</p>
<p>If you did not expect this email, please ignore it.</p>`
  );
}

async function sendPasswordResetEmail(user, token) {
  const url = `${config.appUrl}/set-password?token=${token}`;
  const name = user.first_name || user.username;
  await sendEmail(
    user.email,
    'Reset your password — G.A.P. Portal',
    `<p>Hello ${name},</p>
<p>A password reset was requested for your G.A.P. Portal account. Click the link below to set a new password:</p>
<p><a href="${url}">${url}</a></p>
<p>This link expires in 1 hour.</p>
<p>If you did not request a password reset, you can safely ignore this email.</p>`
  );
}

module.exports = { sendEmail, sendPasswordSetupEmail, sendPasswordResetEmail };
