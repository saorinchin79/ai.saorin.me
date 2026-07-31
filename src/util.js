const crypto = require('crypto');
const config = require('./config');

const nowIso = () => new Date().toISOString();
const isoIn = (ms) => new Date(Date.now() + ms).toISOString();

/** Keyed digest. Used for anything stored at rest that we only ever compare. */
function hash(value) {
  return crypto.createHmac('sha256', config.pepper).update(String(value)).digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function numericCode(length) {
  let out = '';
  while (out.length < length) out += crypto.randomInt(0, 10);
  return out;
}

/** Constant-time compare that tolerates differing lengths. */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* The app sits behind Cloudflare → nginx → Apache, so req.ip is a proxy hop.
   CF-Connecting-IP is authoritative at the edge; these headers are only
   trustworthy because the origin binds to loopback and is unreachable directly. */
function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return String(cf).trim();
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return String(req.ip || '').replace(/^::ffff:/, '');
}

const clientCountry = (req) =>
  String(req.headers['cf-ipcountry'] || '').toUpperCase().replace(/[^A-Z]/g, '') || null;

const userAgent = (req) => String(req.headers['user-agent'] || '').slice(0, 400);

/* ISO country → phone dial code. Cambodia is the default for this audience;
   the list covers the countries the site actually sees. */
const DIAL_CODES = {
  KH: '855', US: '1', CA: '1', GB: '44', AU: '61', NZ: '64', IN: '91', ID: '62',
  MY: '60', SG: '65', TH: '66', VN: '84', PH: '63', LA: '856', MM: '95', CN: '86',
  HK: '852', TW: '886', JP: '81', KR: '82', FR: '33', DE: '49', ES: '34', IT: '39',
  PT: '351', NL: '31', BE: '32', SE: '46', NO: '47', DK: '45', FI: '358', PL: '48',
  RU: '7', UA: '380', BR: '55', MX: '52', AR: '54', AE: '971', SA: '966', QA: '974',
  KW: '965', IL: '972', TR: '90', ZA: '27', NG: '234', KE: '254', EG: '20', PK: '92',
  BD: '880', LK: '94', NP: '977',
};

const dialFor = (country) => DIAL_CODES[country] || DIAL_CODES.KH;

/** Normalise a typed number to E.164, upgrading a local one (012 890 323 →
 *  +855128 90323) with the caller's dial code and dropping the trunk '0'. */
function normalizePhone(input, dial) {
  let p = String(input || '').replace(/[^\d+]/g, '');
  if (p.startsWith('+')) return p;
  p = p.replace(/\D/g, '');
  if (!p) return '';
  if (dial && p.startsWith(dial)) return '+' + p;
  p = p.replace(/^0+/, '');
  return dial ? '+' + dial + p : '+' + p;
}

const isPhone = (p) => /^\+\d{6,15}$/.test(p);

// Deliberately permissive: the OTP round-trip is the real proof of ownership.
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;

const normalizeEmail = (e) => String(e || '').trim().toLowerCase();

/** Redact an identifier for display in logs and the admin UI. */
function maskIdentifier(value) {
  const s = String(value || '');
  if (s.includes('@')) {
    const [local, domain] = s.split('@');
    const head = local.slice(0, 2);
    return `${head}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`;
  }
  if (s.length <= 4) return s;
  return `${s.slice(0, 3)}${'•'.repeat(s.length - 6)}${s.slice(-3)}`;
}

module.exports = {
  nowIso,
  isoIn,
  hash,
  randomToken,
  numericCode,
  safeEqual,
  clientIp,
  clientCountry,
  userAgent,
  dialFor,
  normalizePhone,
  isPhone,
  isEmail,
  normalizeEmail,
  maskIdentifier,
};
