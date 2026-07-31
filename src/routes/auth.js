const express = require('express');
const config = require('../config');
const otp = require('../otp');
const mailer = require('../mailer');
const telegram = require('../telegram');
const {
  createSession,
  destroySession,
  claimAnonymousPrompts,
  publicUser,
  upsertUser,
} = require('../auth');
const {
  clientIp,
  clientCountry,
  dialFor,
  normalizePhone,
  isPhone,
  isEmail,
  normalizeEmail,
  maskIdentifier,
} = require('../util');

const router = express.Router();

const fail = (res, status, error) => res.status(status).json({ error });

/** Turn a thrown OtpError (or anything else) into a response. */
function handle(res, err, fallback) {
  if (err && err.status) return fail(res, err.status, err.message);
  console.error('[auth]', err);
  return fail(res, 502, fallback);
}

/** Finish a verified OTP: find-or-create the account, session it, adopt prompts. */
function completeLogin(req, res, { channel, identifier, displayName }) {
  const ip = clientIp(req);
  const { user, created } = upsertUser({ channel, identifier, displayName, ip });

  if (user.status !== 'active') {
    return fail(res, 403, 'This account has been suspended');
  }

  createSession(res, user, req);
  const claimed = claimAnonymousPrompts(user.id, req.anonId);

  return res.json({
    ok: true,
    created,
    claimedPrompts: claimed,
    user: publicUser(user),
  });
}

/* --------------------------------------------------------------- discovery */

router.get('/config', (req, res) => {
  const country = clientCountry(req) || 'KH';
  res.json({
    email: mailer.enabled(),
    telegram: telegram.enabled(),
    country,
    dial: dialFor(country),
    otpLength: config.otp.length,
    captureNotice: config.captureAnonymous,
  });
});

router.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

/* ------------------------------------------------------------- email  OTP */

router.post('/email/start', async (req, res) => {
  if (!mailer.enabled()) return fail(res, 503, 'Email sign-in is not available right now');

  const email = normalizeEmail(req.body?.email);
  if (!isEmail(email)) return fail(res, 400, 'Enter a valid email address');

  const ip = clientIp(req);
  let gate;
  try {
    gate = otp.checkSendAllowed({ channel: 'email', identifier: email, ip });
  } catch (err) {
    return handle(res, err, 'Could not send the code');
  }
  // A code from moments ago is still live — report success without re-sending.
  if (gate.reuse) return res.json({ ok: true, sent: false, to: maskIdentifier(email) });

  const code = otp.issueLocalCode({
    identifier: email,
    ip,
    displayName: String(req.body?.name || '').slice(0, 80),
  });

  try {
    await mailer.sendOtpEmail(email, code);
  } catch (err) {
    console.error('[auth] email send failed:', err.message);
    return fail(res, 502, 'Could not send the email — please try again');
  }

  otp.recordSend({ channel: 'email', identifier: email, ip });
  res.json({
    ok: true,
    sent: true,
    to: maskIdentifier(email),
    ...(config.devExposeOtp ? { devCode: code } : {}),
  });
});

router.post('/email/verify', (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code || '').replace(/\D/g, '');
  if (!isEmail(email)) return fail(res, 400, 'Enter a valid email address');
  if (!code) return fail(res, 400, 'Enter the code we sent you');

  let row;
  try {
    row = otp.verifyLocalCode({ identifier: email, code });
  } catch (err) {
    return handle(res, err, 'Could not verify the code');
  }

  return completeLogin(req, res, {
    channel: 'email',
    identifier: email,
    displayName: row.display_name,
  });
});

/* ----------------------------------------------------------- telegram OTP */

router.post('/telegram/start', async (req, res) => {
  if (!telegram.enabled()) return fail(res, 503, 'Telegram sign-in is not available right now');

  const dial = dialFor(clientCountry(req) || 'KH');
  const phone = normalizePhone(req.body?.phone, dial);
  if (!isPhone(phone)) {
    return fail(res, 400, 'Enter a valid phone number with country code (e.g. +85512345678)');
  }

  const ip = clientIp(req);
  let gate;
  try {
    gate = otp.checkSendAllowed({ channel: 'telegram', identifier: phone, ip });
  } catch (err) {
    return handle(res, err, 'Could not send the code');
  }
  if (gate.reuse) return res.json({ ok: true, sent: false, to: maskIdentifier(phone) });

  let requestId;
  try {
    requestId = await telegram.sendVerification(phone);
  } catch (err) {
    console.error('[auth] telegram send failed:', err.message);
    // The Gateway's own message ("PHONE_NUMBER_INVALID" etc.) is the useful signal.
    return fail(res, 400, err.message || 'Could not send the code via Telegram');
  }

  otp.issueRemoteCode({
    identifier: phone,
    requestId,
    ip,
    displayName: String(req.body?.name || '').slice(0, 80),
    ttlSeconds: config.telegram.ttlSeconds,
  });
  otp.recordSend({ channel: 'telegram', identifier: phone, ip });

  res.json({ ok: true, sent: true, to: maskIdentifier(phone) });
});

router.post('/telegram/verify', async (req, res) => {
  if (!telegram.enabled()) return fail(res, 503, 'Telegram sign-in is not available right now');

  const dial = dialFor(clientCountry(req) || 'KH');
  const phone = normalizePhone(req.body?.phone, dial);
  const code = String(req.body?.code || '').replace(/\D/g, '');
  if (!isPhone(phone)) return fail(res, 400, 'Enter a valid phone number');
  if (!code) return fail(res, 400, 'Enter the code we sent you');

  const row = otp.pendingFor('telegram', phone);
  if (!row) return fail(res, 400, 'Request a code first');
  if (new Date(row.expires_at).getTime() < Date.now()) {
    otp.consume(row.id);
    return fail(res, 400, 'Code expired — request a new one');
  }

  let result;
  try {
    result = await telegram.checkVerification(row.request_id, code);
  } catch (err) {
    console.error('[auth] telegram verify failed:', err.message);
    return fail(res, 502, 'Could not reach Telegram — please try again');
  }

  if (!result.valid) {
    if (result.reason === 'max_attempts') {
      otp.consume(row.id);
      return fail(res, 400, 'Too many attempts — request a new code');
    }
    if (result.reason === 'expired') {
      otp.consume(row.id);
      return fail(res, 400, 'Code expired — request a new one');
    }
    try {
      otp.bumpAttempts(row);
    } catch (err) {
      return handle(res, err, 'Could not verify the code');
    }
    return fail(res, 400, 'Invalid code');
  }

  otp.consume(row.id);
  return completeLogin(req, res, {
    channel: 'telegram',
    identifier: phone,
    displayName: row.display_name,
  });
});

module.exports = router;
