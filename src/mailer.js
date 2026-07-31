const nodemailer = require('nodemailer');
const config = require('./config');

let transport = null;

function getTransport() {
  if (!config.smtp.enabled) return null;
  if (!transport) {
    if (config.smtp.transport === 'json') {
      transport = nodemailer.createTransport({ jsonTransport: true });
      return transport;
    }
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: false, // Elastic Email on 2525 is STARTTLS, not implicit TLS
      requireTLS: true,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transport;
}

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function codeEmail(code) {
  const minutes = config.otp.ttlMinutes;
  const text = [
    `Your AI Generator Template sign-in code is ${code}`,
    '',
    `It expires in ${minutes} minutes and can be used once.`,
    "If you didn't request this, you can ignore this email.",
    '',
    config.publicUrl,
  ].join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;background:#0d0f12;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:460px;margin:0 auto;background:#15181d;border:1px solid #262b33;border-radius:14px;padding:32px;color:#e8eaed">
    <div style="font-size:11px;letter-spacing:3px;color:#c8f04a;font-family:ui-monospace,Menlo,monospace">PROMPT STUDIO</div>
    <h1 style="margin:8px 0 20px;font-size:20px;font-weight:700;color:#e8eaed">Your sign-in code</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#c6ccd6">
      Enter this code to finish signing in to AI Generator Template.
    </p>
    <div style="font-family:ui-monospace,Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#c8f04a;background:#0d0f12;border:1px solid #3a4150;border-radius:10px;padding:18px;text-align:center">${esc(code)}</div>
    <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#8b93a1">
      The code expires in ${minutes} minutes and can only be used once.
      If you didn't request it, you can safely ignore this email.
    </p>
    <p style="margin:24px 0 0;font-size:12px;color:#5c6470">
      <a href="${esc(config.publicUrl)}" style="color:#c8f04a;text-decoration:none">${esc(
        config.publicUrl.replace(/^https?:\/\//, '')
      )}</a>
    </p>
  </div>
</body></html>`;

  return { text, html };
}

async function sendOtpEmail(to, code) {
  const t = getTransport();
  if (!t) throw new Error('SMTP is not configured');
  const { text, html } = codeEmail(code);
  await t.sendMail({
    from: `"${config.smtp.fromName}" <${config.smtp.from}>`,
    to,
    subject: `${code} is your sign-in code`,
    text,
    html,
  });
}

async function verifyTransport() {
  const t = getTransport();
  if (!t) return { ok: false, error: 'SMTP is not configured' };
  try {
    await t.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { sendOtpEmail, verifyTransport, enabled: () => config.smtp.enabled };
