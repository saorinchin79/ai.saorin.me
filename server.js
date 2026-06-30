const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3600;
const DATA_DIR = path.join(__dirname, 'data');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- tiny JSON template store (optional server-side library) ---------- */
function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(TEMPLATES_FILE)) fs.writeFileSync(TEMPLATES_FILE, '[]');
}
function readTemplates() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8'));
  } catch {
    return [];
  }
}
function writeTemplates(list) {
  ensureStore();
  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(list, null, 2));
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/templates', (_req, res) => {
  res.json(readTemplates());
});

// upsert by name
app.post('/api/templates', (req, res) => {
  const { name, data } = req.body || {};
  if (!name || typeof name !== 'string' || !data) {
    return res.status(400).json({ error: 'name (string) and data (object) are required' });
  }
  const list = readTemplates();
  const now = new Date().toISOString();
  const existing = list.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.data = data;
    existing.updatedAt = now;
    writeTemplates(list);
    return res.json(existing);
  }
  const record = { id: 't_' + Date.now().toString(36), name, data, createdAt: now, updatedAt: now };
  list.push(record);
  writeTemplates(list);
  res.status(201).json(record);
});

app.delete('/api/templates/:id', (req, res) => {
  const list = readTemplates();
  const next = list.filter((t) => t.id !== req.params.id);
  if (next.length === list.length) return res.status(404).json({ error: 'not found' });
  writeTemplates(next);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\n  🎬  AI Prompt Template Generator`);
  console.log(`      running at  http://localhost:${PORT}\n`);
});
