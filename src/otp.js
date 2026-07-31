const config = require('./config');
const db = require('./db');
const { hash, numericCode, nowIso, isoIn, safeEqual } = require('./util');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

class OtpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

const since = (ms) => new Date(Date.now() - ms).toISOString();

function countSends(where, params) {
  return db.prepare(`SELECT COUNT(*) c FROM otp_sends WHERE ${where}`).get(...params).c;
}

/**
 * Guard a send before it happens. Throws OtpError, or returns
 * `{ reuse: true }` when a still-valid code was issued moments ago — the caller
 * should then report success without paying for another delivery.
 */
function checkSendAllowed({ channel, identifier, ip }) {
  const live = db
    .prepare(
      `SELECT created_at FROM otp_codes
       WHERE channel = ? AND identifier = ? AND consumed_at IS NULL AND expires_at > ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(channel, identifier, nowIso());

  if (live) {
    const age = Date.now() - new Date(live.created_at).getTime();
    if (age < config.limits.resendCooldownSeconds * 1000) return { reuse: true };
  }

  const perIdent = countSends('channel = ? AND identifier = ? AND created_at > ?', [
    channel,
    identifier,
    since(HOUR),
  ]);
  if (perIdent >= config.limits.perIdentifierPerHour) {
    throw new OtpError(429, 'Too many codes requested for this account — try again in an hour');
  }

  if (ip) {
    const perIp = countSends('ip = ? AND created_at > ?', [ip, since(HOUR)]);
    if (perIp >= config.limits.perIpPerHour) {
      throw new OtpError(429, 'Too many code requests — please try again in a few minutes');
    }
  }

  const dailyCap =
    channel === 'telegram' ? config.limits.telegramPerDay : config.limits.emailPerDay;
  const perDay = countSends('channel = ? AND created_at > ?', [channel, since(24 * HOUR)]);
  if (perDay >= dailyCap) {
    throw new OtpError(429, 'Service is busy — please try again later');
  }

  return { reuse: false };
}

function recordSend({ channel, identifier, ip }) {
  db.prepare('INSERT INTO otp_sends (channel, identifier, ip, created_at) VALUES (?, ?, ?, ?)')
    .run(channel, identifier, ip, nowIso());
}

/** Invalidate any outstanding codes so only the newest one can be redeemed. */
function supersede(channel, identifier) {
  db.prepare(
    `UPDATE otp_codes SET consumed_at = ?
     WHERE channel = ? AND identifier = ? AND consumed_at IS NULL`
  ).run(nowIso(), channel, identifier);
}

/** Email path: we generate and store the code ourselves. */
function issueLocalCode({ identifier, ip, displayName }) {
  supersede('email', identifier);
  const code = numericCode(config.otp.length);
  db.prepare(
    `INSERT INTO otp_codes (channel, identifier, code_hash, created_at, expires_at, ip, display_name)
     VALUES ('email', ?, ?, ?, ?, ?, ?)`
  ).run(
    identifier,
    hash(code),
    nowIso(),
    isoIn(config.otp.ttlMinutes * MIN),
    ip,
    displayName || null
  );
  return code;
}

/** Telegram path: the Gateway owns the code, we only track its request_id. */
function issueRemoteCode({ identifier, requestId, ip, displayName, ttlSeconds }) {
  supersede('telegram', identifier);
  db.prepare(
    `INSERT INTO otp_codes (channel, identifier, request_id, created_at, expires_at, ip, display_name)
     VALUES ('telegram', ?, ?, ?, ?, ?, ?)`
  ).run(
    identifier,
    requestId,
    nowIso(),
    isoIn(Math.max(ttlSeconds * 1000, config.otp.ttlMinutes * MIN)),
    ip,
    displayName || null
  );
}

function pendingFor(channel, identifier) {
  return db
    .prepare(
      `SELECT * FROM otp_codes
       WHERE channel = ? AND identifier = ? AND consumed_at IS NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get(channel, identifier);
}

function consume(id) {
  db.prepare('UPDATE otp_codes SET consumed_at = ? WHERE id = ?').run(nowIso(), id);
}

function bumpAttempts(row) {
  const attempts = row.attempts + 1;
  db.prepare('UPDATE otp_codes SET attempts = ? WHERE id = ?').run(attempts, row.id);
  if (attempts >= config.otp.maxAttempts) {
    consume(row.id);
    throw new OtpError(400, 'Too many incorrect attempts — request a new code');
  }
}

/** Verify a locally-issued (email) code. Returns the pending row on success. */
function verifyLocalCode({ identifier, code }) {
  const row = pendingFor('email', identifier);
  if (!row) throw new OtpError(400, 'Request a code first');
  if (new Date(row.expires_at).getTime() < Date.now()) {
    consume(row.id);
    throw new OtpError(400, 'Code expired — request a new one');
  }
  if (!safeEqual(hash(code), row.code_hash)) {
    bumpAttempts(row);
    throw new OtpError(400, 'Invalid code');
  }
  consume(row.id);
  return row;
}

/** Drop spent rows so the tables stay small. */
function prune() {
  const cutoff = since(30 * 24 * HOUR);
  db.prepare('DELETE FROM otp_codes WHERE created_at < ?').run(cutoff);
  db.prepare('DELETE FROM otp_sends WHERE created_at < ?').run(cutoff);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso());
}

module.exports = {
  OtpError,
  checkSendAllowed,
  recordSend,
  issueLocalCode,
  issueRemoteCode,
  pendingFor,
  consume,
  bumpAttempts,
  verifyLocalCode,
  prune,
};
