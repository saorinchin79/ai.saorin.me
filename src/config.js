const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

/* Secrets live in an untracked .env beside the app — never in git. Values already
   present in process.env win, so `pm2 restart --update-env` can override anything. */
function loadEnvFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const eq = s.indexOf('=');
    if (eq === -1) continue;
    const key = s.slice(0, eq).trim();
    let val = s.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(path.join(ROOT, '.env'));

const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

/* The pepper salts every OTP and session-token hash at rest. Generated once on
   first boot so a fresh deploy works without hand-editing .env; losing it only
   invalidates live sessions and pending codes. */
function resolvePepper() {
  if (process.env.APP_PEPPER) return process.env.APP_PEPPER;
  const file = path.join(DATA_DIR, '.pepper');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  } catch {
    /* first boot */
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, generated, { mode: 0o600 });
  return generated;
}

const num = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};
const list = (v) =>
  String(v || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

module.exports = {
  root: ROOT,
  port: num(process.env.PORT, 3600),
  dataDir: DATA_DIR,
  dbFile: process.env.DB_FILE || path.join(DATA_DIR, 'app.db'),
  pepper: resolvePepper(),

  publicUrl: (process.env.PUBLIC_URL || 'https://ai.saorin.me').replace(/\/+$/, ''),
  // Cookies are Secure in production; plain http on localhost would drop them.
  cookieSecure: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === '1'
    : process.env.NODE_ENV === 'production',

  session: {
    cookie: 'aigen_sess',
    ttlDays: num(process.env.SESSION_TTL_DAYS, 30),
  },
  anonCookie: 'aigen_uid',

  otp: {
    length: 6,
    ttlMinutes: num(process.env.OTP_TTL_MINUTES, 10),
    maxAttempts: num(process.env.OTP_MAX_ATTEMPTS, 5),
  },

  /* OTP delivery costs money (Telegram Gateway bills ~$0.01/code against a balance
     shared with beta.als.social, leng.social and earn.als.social), so every send is
     capped three ways: per identifier, per IP, and globally per day. */
  limits: {
    resendCooldownSeconds: num(process.env.OTP_RESEND_COOLDOWN, 60),
    perIdentifierPerHour: num(process.env.OTP_PER_IDENTIFIER_HOUR, 3),
    perIpPerHour: num(process.env.OTP_PER_IP_HOUR, 5),
    telegramPerDay: num(process.env.TG_DAILY_MAX, 200),
    emailPerDay: num(process.env.EMAIL_DAILY_MAX, 500),
    promptsPerIpPerHour: num(process.env.PROMPTS_PER_IP_HOUR, 240),
  },

  smtp: {
    // 'json' swaps in nodemailer's non-sending transport so the whole flow can
    // be exercised locally without mailing anyone.
    transport: process.env.SMTP_TRANSPORT === 'json' ? 'json' : 'smtp',
    host: process.env.SMTP_HOST || 'smtp.elasticemail.com',
    port: num(process.env.SMTP_PORT, 2525),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
    fromName: process.env.SMTP_FROM_NAME || 'AI Generator Template',
    get enabled() {
      return this.transport === 'json' || Boolean(this.user && this.pass && this.from);
    },
  },

  telegram: {
    apiBase: process.env.TG_GATEWAY_BASE || 'https://gatewayapi.telegram.org',
    token: process.env.TG_GATEWAY_TOKEN || '',
    ttlSeconds: num(process.env.TG_CODE_TTL, 300),
    get enabled() {
      return Boolean(this.token);
    },
  },

  // Seeded as role=superadmin on boot, and re-asserted on every login so access
  // survives a wiped database.
  superadmins: list(process.env.SUPERADMIN_EMAILS),

  // Prompt capture is disclosed in the UI; this switch turns the whole feature off.
  captureAnonymous: process.env.CAPTURE_ANONYMOUS !== '0',

  /* Returns the freshly issued code in the API response so integration tests can
     complete a sign-in. Double-gated, and refuses to arm under NODE_ENV=production. */
  devExposeOtp: process.env.OTP_DEBUG === '1' && process.env.NODE_ENV !== 'production',
};
