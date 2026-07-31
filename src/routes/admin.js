const express = require('express');
const db = require('../db');
const { requireSuperadmin } = require('../auth');
const { nowIso } = require('../util');

const router = express.Router();

router.use(requireSuperadmin);

const clampInt = (v, min, max, dflt) => {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(Math.max(n, min), max);
};

/** Label a prompt's author for the list view. */
function author(row) {
  if (row.user_id) {
    return {
      type: 'user',
      id: row.user_id,
      label: row.email || row.phone || row.display_name || `User #${row.user_id}`,
      role: row.role,
    };
  }
  return { type: 'anonymous', id: null, label: `anon:${String(row.anon_id || '').slice(0, 8)}` };
}

function shapePrompt(row) {
  return {
    id: row.id,
    author: author(row),
    anonId: row.anon_id,
    mode: row.mode,
    model: row.model,
    lang: row.lang,
    prompt: row.prompt,
    charCount: row.char_count,
    ip: row.ip,
    country: row.country,
    createdAt: row.created_at,
  };
}

/* ------------------------------------------------------------------ stats */

router.get('/stats', (_req, res) => {
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const day = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  res.json({
    prompts: {
      total: one('SELECT COUNT(*) c FROM prompts').c,
      anonymous: one('SELECT COUNT(*) c FROM prompts WHERE user_id IS NULL').c,
      registered: one('SELECT COUNT(*) c FROM prompts WHERE user_id IS NOT NULL').c,
      last24h: one('SELECT COUNT(*) c FROM prompts WHERE created_at > ?', day).c,
      last7d: one('SELECT COUNT(*) c FROM prompts WHERE created_at > ?', week).c,
    },
    users: {
      total: one('SELECT COUNT(*) c FROM users').c,
      last7d: one('SELECT COUNT(*) c FROM users WHERE created_at > ?', week).c,
      blocked: one("SELECT COUNT(*) c FROM users WHERE status = 'blocked'").c,
    },
    visitors: {
      anonBrowsers: one(
        'SELECT COUNT(DISTINCT anon_id) c FROM prompts WHERE user_id IS NULL AND anon_id IS NOT NULL'
      ).c,
    },
    topModels: db
      .prepare(
        `SELECT model, COUNT(*) c FROM prompts
         WHERE model IS NOT NULL GROUP BY model ORDER BY c DESC LIMIT 8`
      )
      .all(),
    byMode: db
      .prepare('SELECT mode, COUNT(*) c FROM prompts GROUP BY mode ORDER BY c DESC')
      .all(),
    daily: db
      .prepare(
        `SELECT substr(created_at, 1, 10) d, COUNT(*) c FROM prompts
         WHERE created_at > ? GROUP BY d ORDER BY d`
      )
      .all(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()),
  });
});

/* --------------------------------------------------- User Prompt Modules */

router.get('/prompts', (req, res) => {
  const limit = clampInt(req.query.limit, 1, 200, 50);
  const page = clampInt(req.query.page, 1, 100000, 1);
  const where = [];
  const params = [];

  const audience = String(req.query.audience || 'all');
  if (audience === 'anonymous') where.push('p.user_id IS NULL');
  else if (audience === 'registered') where.push('p.user_id IS NOT NULL');

  if (req.query.userId) {
    where.push('p.user_id = ?');
    params.push(clampInt(req.query.userId, 1, 1e9, 0));
  }
  if (req.query.model) {
    where.push('p.model = ?');
    params.push(String(req.query.model));
  }
  if (req.query.mode) {
    where.push('p.mode = ?');
    params.push(String(req.query.mode));
  }
  const q = String(req.query.q || '').trim();
  if (q) {
    where.push('(p.prompt LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (req.query.from) {
    where.push('p.created_at >= ?');
    params.push(String(req.query.from));
  }
  if (req.query.to) {
    where.push('p.created_at <= ?');
    params.push(String(req.query.to));
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const base = `FROM prompts p LEFT JOIN users u ON u.id = p.user_id ${clause}`;

  const total = db.prepare(`SELECT COUNT(*) c ${base}`).get(...params).c;
  const rows = db
    .prepare(
      `SELECT p.*, u.email, u.phone, u.display_name, u.role ${base}
       ORDER BY p.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, (page - 1) * limit);

  res.json({
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    prompts: rows.map(shapePrompt),
  });
});

router.get('/prompts/:id', (req, res) => {
  const row = db
    .prepare(
      `SELECT p.*, u.email, u.phone, u.display_name, u.role
       FROM prompts p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?`
    )
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  let fields = null;
  try {
    fields = row.fields_json ? JSON.parse(row.fields_json) : null;
  } catch {
    /* stored blob is malformed — show the prompt anyway */
  }
  res.json({ prompt: { ...shapePrompt(row), fields, userAgent: row.user_agent } });
});

router.delete('/prompts/:id', (req, res) => {
  const r = db.prepare('DELETE FROM prompts WHERE id = ?').run(req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

/** CSV of the current filter, for offline analysis. */
router.get('/prompts.csv', (req, res) => {
  const audience = String(req.query.audience || 'all');
  const where =
    audience === 'anonymous'
      ? 'WHERE p.user_id IS NULL'
      : audience === 'registered'
        ? 'WHERE p.user_id IS NOT NULL'
        : '';
  const rows = db
    .prepare(
      `SELECT p.*, u.email, u.phone, u.display_name, u.role
       FROM prompts p LEFT JOIN users u ON u.id = p.user_id ${where}
       ORDER BY p.id DESC LIMIT 20000`
    )
    .all();

  const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const lines = [
    ['id', 'created_at', 'author_type', 'author', 'mode', 'model', 'lang', 'chars', 'country', 'prompt']
      .map(cell)
      .join(','),
  ];
  for (const r of rows) {
    const a = author(r);
    lines.push(
      [r.id, r.created_at, a.type, a.label, r.mode, r.model, r.lang, r.char_count, r.country, r.prompt]
        .map(cell)
        .join(',')
    );
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="user-prompt-modules.csv"');
  res.send(lines.join('\n'));
});

/* ------------------------------------------------------------------ users */

router.get('/users', (req, res) => {
  const limit = clampInt(req.query.limit, 1, 200, 50);
  const page = clampInt(req.query.page, 1, 100000, 1);
  const q = String(req.query.q || '').trim();

  const where = [];
  const params = [];
  if (q) {
    where.push('(email LIKE ? OR phone LIKE ? OR display_name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) c FROM users ${clause}`).get(...params).c;
  const rows = db
    .prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM prompts p WHERE p.user_id = u.id) prompt_count
       FROM users u ${clause} ORDER BY u.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, (page - 1) * limit);

  res.json({
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    users: rows.map((u) => ({
      id: u.id,
      email: u.email,
      phone: u.phone,
      displayName: u.display_name,
      role: u.role,
      status: u.status,
      promptCount: u.prompt_count,
      createdAt: u.created_at,
      lastLoginAt: u.last_login_at,
    })),
  });
});

router.patch('/users/:id', (req, res) => {
  const id = clampInt(req.params.id, 1, 1e9, 0);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'not found' });
  if (user.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot change your own role or status' });
  }

  const { role, status } = req.body || {};
  if (role && !['user', 'superadmin'].includes(role)) {
    return res.status(400).json({ error: 'invalid role' });
  }
  if (status && !['active', 'blocked'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }

  if (role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  if (status) {
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
    // Blocking must take effect immediately, not at session expiry.
    if (status === 'blocked') {
      db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
        .run(nowIso(), id);
    }
  }

  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  const id = clampInt(req.params.id, 1, 1e9, 0);
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete yourself' });
  const r = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (!r.changes) return res.status(404).json({ error: 'not found' });
  // prompts.user_id is ON DELETE SET NULL — the prompts survive as anonymous.
  res.json({ ok: true });
});

module.exports = router;
