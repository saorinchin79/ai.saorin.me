const crypto = require('crypto');
const config = require('./config');
const db = require('./db');
const { hash, randomToken, nowIso, isoIn, clientIp, userAgent } = require('./util');

const DAY_MS = 24 * 60 * 60 * 1000;

const baseCookie = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookieSecure,
  path: '/',
};

/* ---------------------------------------------------------------- sessions */

function createSession(res, user, req) {
  const token = randomToken(32);
  const ttl = config.session.ttlDays * DAY_MS;
  db.prepare(
    `INSERT INTO sessions (user_id, token_hash, created_at, expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(user.id, hash(token), nowIso(), isoIn(ttl), clientIp(req), userAgent(req));
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), user.id);
  res.cookie(config.session.cookie, token, { ...baseCookie, maxAge: ttl });
  return token;
}

function destroySession(req, res) {
  const token = req.cookies?.[config.session.cookie];
  if (token) {
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
      .run(nowIso(), hash(token));
  }
  res.clearCookie(config.session.cookie, baseCookie);
}

function userForToken(token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?
         AND s.revoked_at IS NULL
         AND s.expires_at > ?`
    )
    .get(hash(token), nowIso());
  if (!row || row.status !== 'active') return null;
  return row;
}

/* ------------------------------------------------------- anonymous identity */

/** Every browser gets a stable id so its pre-signup prompts stay grouped, and
 *  can be adopted onto the account when it eventually registers. */
function ensureAnonId(req, res) {
  let id = req.cookies?.[config.anonCookie];
  if (!/^[a-f0-9]{32}$/.test(String(id || ''))) {
    id = crypto.randomBytes(16).toString('hex');
    res.cookie(config.anonCookie, id, { ...baseCookie, httpOnly: false, maxAge: 365 * DAY_MS });
  }
  req.anonId = id;
  return id;
}

/** Populates req.user / req.anonId on every request. Never rejects. */
function attachIdentity(req, res, next) {
  req.user = userForToken(req.cookies?.[config.session.cookie]);
  ensureAnonId(req, res);
  next();
}

/** Move this browser's anonymous prompts onto the account it just signed into. */
function claimAnonymousPrompts(userId, anonId) {
  if (!anonId) return 0;
  const r = db
    .prepare('UPDATE prompts SET user_id = ? WHERE anon_id = ? AND user_id IS NULL')
    .run(userId, anonId);
  return r.changes;
}

/* -------------------------------------------------------------- middleware */

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue' });
  next();
}

function requireSuperadmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue' });
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
  next();
}

/* ------------------------------------------------------------------- users */

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    displayName: u.display_name,
    role: u.role,
    createdAt: u.created_at,
  };
}

/** Find-or-create by verified identifier. `channel` is 'email' or 'telegram'. */
function upsertUser({ channel, identifier, displayName, ip }) {
  const column = channel === 'email' ? 'email' : 'phone';
  let user = db.prepare(`SELECT * FROM users WHERE ${column} = ?`).get(identifier);

  if (!user) {
    const fallbackName =
      displayName || (channel === 'email' ? identifier.split('@')[0] : identifier);
    const role = config.superadmins.includes(String(identifier).toLowerCase())
      ? 'superadmin'
      : 'user';
    const info = db
      .prepare(
        `INSERT INTO users (${column}, display_name, role, created_at, signup_ip)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(identifier, String(fallbackName).slice(0, 80), role, nowIso(), ip);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    return { user, created: true };
  }

  // Re-assert superadmin from config so the allow-list stays the source of truth.
  if (
    channel === 'email' &&
    config.superadmins.includes(String(identifier).toLowerCase()) &&
    user.role !== 'superadmin'
  ) {
    db.prepare("UPDATE users SET role = 'superadmin' WHERE id = ?").run(user.id);
    user.role = 'superadmin';
  }
  if (displayName && !user.display_name) {
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?')
      .run(String(displayName).slice(0, 80), user.id);
    user.display_name = displayName;
  }
  return { user, created: false };
}

module.exports = {
  createSession,
  destroySession,
  attachIdentity,
  requireAuth,
  requireSuperadmin,
  claimAnonymousPrompts,
  publicUser,
  upsertUser,
};
