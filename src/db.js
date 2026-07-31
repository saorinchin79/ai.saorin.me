const Database = require('better-sqlite3');
const config = require('./config');

const db = new Database(config.dbFile);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

/* Migrations are append-only: add a new entry, never edit a shipped one. */
const MIGRATIONS = [
  {
    name: '001-init',
    up: `
      CREATE TABLE users (
        id            INTEGER PRIMARY KEY,
        email         TEXT UNIQUE,           -- lowercased
        phone         TEXT UNIQUE,           -- E.164
        display_name  TEXT,
        role          TEXT NOT NULL DEFAULT 'user',    -- user | superadmin
        status        TEXT NOT NULL DEFAULT 'active',  -- active | blocked
        created_at    TEXT NOT NULL,
        last_login_at TEXT,
        signup_ip     TEXT,
        CHECK (email IS NOT NULL OR phone IS NOT NULL)
      );

      CREATE TABLE sessions (
        id          INTEGER PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash  TEXT NOT NULL UNIQUE,
        created_at  TEXT NOT NULL,
        expires_at  TEXT NOT NULL,
        revoked_at  TEXT,
        ip          TEXT,
        user_agent  TEXT
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);

      -- One row per issued code. Email codes are verified here (code_hash);
      -- Telegram codes are verified by the Gateway against request_id.
      CREATE TABLE otp_codes (
        id          INTEGER PRIMARY KEY,
        channel     TEXT NOT NULL,           -- email | telegram
        identifier  TEXT NOT NULL,           -- email address or E.164 phone
        code_hash   TEXT,
        request_id  TEXT,
        attempts    INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        expires_at  TEXT NOT NULL,
        consumed_at TEXT,
        ip          TEXT,
        display_name TEXT
      );
      CREATE INDEX idx_otp_lookup ON otp_codes(channel, identifier, consumed_at);

      -- Ledger of *billed* sends, used for the rate limits.
      CREATE TABLE otp_sends (
        id         INTEGER PRIMARY KEY,
        channel    TEXT NOT NULL,
        identifier TEXT NOT NULL,
        ip         TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_otp_sends_time ON otp_sends(created_at);
      CREATE INDEX idx_otp_sends_ident ON otp_sends(identifier, created_at);
      CREATE INDEX idx_otp_sends_ip ON otp_sends(ip, created_at);

      -- Every prompt a visitor copies, signed in or not. anon_id groups the
      -- prompts of one browser; it is adopted onto user_id at sign-in.
      CREATE TABLE prompts (
        id          INTEGER PRIMARY KEY,
        user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
        anon_id     TEXT,
        mode        TEXT,
        model       TEXT,
        lang        TEXT,
        prompt      TEXT NOT NULL,
        fields_json TEXT,
        char_count  INTEGER,
        ip          TEXT,
        country     TEXT,
        user_agent  TEXT,
        created_at  TEXT NOT NULL
      );
      CREATE INDEX idx_prompts_created ON prompts(created_at DESC);
      CREATE INDEX idx_prompts_user ON prompts(user_id, created_at DESC);
      CREATE INDEX idx_prompts_anon ON prompts(anon_id, created_at DESC);
    `,
  },
];

function migrate() {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)'
  );
  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name)
  );
  const record = db.prepare(
    'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)'
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.name)) continue;
    db.transaction(() => {
      db.exec(m.up);
      record.run(m.name, new Date().toISOString());
    })();
    console.log(`[db] applied migration ${m.name}`);
  }
}

migrate();

/* Anyone listed in SUPERADMIN_EMAILS is a superadmin. Seeded here so the first
   admin exists before they ever sign in, and re-asserted on login. */
function seedSuperadmins() {
  const now = new Date().toISOString();
  const find = db.prepare('SELECT id, role FROM users WHERE email = ?');
  const insert = db.prepare(
    "INSERT INTO users (email, display_name, role, created_at) VALUES (?, ?, 'superadmin', ?)"
  );
  const promote = db.prepare("UPDATE users SET role = 'superadmin' WHERE id = ?");
  for (const email of config.superadmins) {
    const row = find.get(email);
    if (!row) {
      insert.run(email, email.split('@')[0], now);
      console.log(`[db] seeded superadmin ${email}`);
    } else if (row.role !== 'superadmin') {
      promote.run(row.id);
      console.log(`[db] promoted ${email} to superadmin`);
    }
  }
}

seedSuperadmins();

module.exports = db;
