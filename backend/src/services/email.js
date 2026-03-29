const nodemailer = require('nodemailer');
const config = require('../config/index');

let _transporter = null;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

function emailLayout(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Group Assignment Portal</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#1d4ed8;padding:28px 40px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">Group Assignment Portal</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;color:#374151;font-size:15px;line-height:1.6;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #e5e7eb;background-color:#f9fafb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                This is an automated message from Group Assignment Portal. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendPasswordSetupEmail(user, token) {
  const url = escapeHtml(`${config.appUrl}/set-password?token=${token}`);
  const name = escapeHtml(user.first_name || user.username);
  const username = escapeHtml(user.username);

  const content = `
    <p style="margin:0 0 16px;">Hello ${name},</p>
    <p style="margin:0 0 16px;">
      Your account has been created on <strong>Group Assignment Portal</strong>.
      To get started, please set a password for your account.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="background-color:#f3f4f6;border-radius:6px;padding:12px 16px;">
          <p style="margin:0;font-size:13px;color:#6b7280;">Your username</p>
          <p style="margin:4px 0 0;font-size:16px;font-weight:600;color:#111827;">${username}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 24px;">Click the button below to set your password:</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="background-color:#1d4ed8;border-radius:6px;padding:12px 28px;">
          <a href="${url}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">Set My Password</a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
      Or copy and paste this link into your browser:
    </p>
    <p style="margin:0 0 24px;font-size:13px;word-break:break-all;">
      <a href="${url}" style="color:#1d4ed8;">${url}</a>
    </p>
    <p style="margin:0;font-size:13px;color:#6b7280;">
      This link expires in <strong>24 hours</strong>.
      If you did not expect this email, you can safely ignore it.
    </p>`;

  await sendEmail(user.email, 'Set your password — Group Assignment Portal', emailLayout(content));
}

async function sendPasswordResetEmail(user, token) {
  const url = escapeHtml(`${config.appUrl}/set-password?token=${token}`);
  const name = escapeHtml(user.first_name || user.username);

  const content = `
    <p style="margin:0 0 16px;">Hello ${name},</p>
    <p style="margin:0 0 24px;">
      We received a request to reset the password for your <strong>Group Assignment Portal</strong> account.
      Click the button below to choose a new password.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="background-color:#1d4ed8;border-radius:6px;padding:12px 28px;">
          <a href="${url}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">Reset My Password</a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
      Or copy and paste this link into your browser:
    </p>
    <p style="margin:0 0 24px;font-size:13px;word-break:break-all;">
      <a href="${url}" style="color:#1d4ed8;">${url}</a>
    </p>
    <p style="margin:0;font-size:13px;color:#6b7280;">
      This link expires in <strong>1 hour</strong>.
      If you did not request a password reset, you can safely ignore this email — your account remains unchanged.
    </p>`;

  await sendEmail(user.email, 'Reset your password — Group Assignment Portal', emailLayout(content));
}

module.exports = { sendEmail, sendPasswordSetupEmail, sendPasswordResetEmail };
