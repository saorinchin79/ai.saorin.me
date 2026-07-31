const express = require('express');
const config = require('../config');
const db = require('../db');
const { requireAuth } = require('../auth');
const { nowIso, clientIp, clientCountry, userAgent } = require('../util');

const router = express.Router();

const MAX_PROMPT = 8000;
const MAX_FIELDS_JSON = 4000;

/* A crude in-memory throttle. Prompt capture is unauthenticated by design, so
   this stops one browser filling the table; it resets on restart, which is fine
   for a single pm2 fork process. */
const ipHits = new Map();
function throttled(ip) {
  if (!ip) return false;
  const now = Date.now();
  const hits = (ipHits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  if (hits.length >= config.limits.promptsPerIpPerHour) {
    ipHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  ipHits.set(ip, hits);
  if (ipHits.size > 5000) ipHits.clear(); // crude bound on memory
  return false;
}

const str = (v, max) => (v == null ? null : String(v).slice(0, max));

function shape(row) {
  return {
    id: row.id,
    model: row.model,
    mode: row.mode,
    prompt: row.prompt,
    lang: row.lang,
    charCount: row.char_count,
    createdAt: row.created_at,
  };
}

/** Record a prompt the visitor just copied. Works signed in or not. */
router.post('/', (req, res) => {
  if (!config.captureAnonymous && !req.user) return res.json({ ok: true, saved: false });

  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  if (prompt.length > MAX_PROMPT) return res.status(413).json({ error: 'prompt is too long' });

  const ip = clientIp(req);
  if (throttled(ip)) return res.status(429).json({ error: 'Slow down a moment' });

  let fieldsJson = null;
  if (req.body?.fields && typeof req.body.fields === 'object') {
    const encoded = JSON.stringify(req.body.fields);
    if (encoded.length <= MAX_FIELDS_JSON) fieldsJson = encoded;
  }

  const info = db
    .prepare(
      `INSERT INTO prompts
         (user_id, anon_id, mode, model, lang, prompt, fields_json, char_count, ip, country, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user ? req.user.id : null,
      req.anonId,
      str(req.body?.mode, 16),
      str(req.body?.model, 80),
      str(req.body?.lang, 8),
      prompt,
      fieldsJson,
      prompt.length,
      ip,
      clientCountry(req),
      userAgent(req),
      nowIso()
    );

  res.status(201).json({ ok: true, saved: true, id: info.lastInsertRowid });
});

/** Server-side history — the reason to register. */
router.get('/mine', requireAuth, (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const rows = db
    .prepare('SELECT * FROM prompts WHERE user_id = ? ORDER BY id DESC LIMIT ?')
    .all(req.user.id, limit);
  res.json({ prompts: rows.map(shape) });
});

router.delete('/mine/:id', requireAuth, (req, res) => {
  const r = db
    .prepare('DELETE FROM prompts WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (!r.changes) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

router.delete('/mine', requireAuth, (req, res) => {
  const r = db.prepare('DELETE FROM prompts WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true, deleted: r.changes });
});

module.exports = router;
