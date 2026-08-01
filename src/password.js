const crypto = require('crypto');

/* scrypt from Node's stdlib — memory-hard, no native dependency to build on the
   deploy target (which is exactly where better-sqlite3's prebuild bit us).
   Stored form: scrypt$N$r$p$saltHex$hashHex — parameters travel with the hash so
   they can be raised later without invalidating existing passwords. */

const N = 16384; // CPU/memory cost
const R = 8; // block size
const P = 1; // parallelisation
const KEYLEN = 64;
const SALT_BYTES = 16;

// scrypt needs maxmem above roughly 128 * N * r; the default 32 MB is too low.
const MAXMEM = 64 * 1024 * 1024;

function derive(password, salt, n = N, r = R, p = P) {
  return crypto.scryptSync(String(password), salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM });
}

function hash(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = derive(password, salt);
  return ['scrypt', N, R, P, salt.toString('hex'), key.toString('hex')].join('$');
}

/** Constant-time verify. Returns false on any malformed stored value. */
function verify(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, saltHex, keyHex] = parts;
  let expected;
  let actual;
  try {
    expected = Buffer.from(keyHex, 'hex');
    actual = derive(password, Buffer.from(saltHex, 'hex'), Number(n), Number(r), Number(p));
  } catch {
    return false;
  }
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

/** True when `stored` already represents exactly this password — lets the boot
 *  seeder skip a rewrite (and a new salt) when nothing has changed. */
const matches = (password, stored) => verify(password, stored);

module.exports = { hash, verify, matches };
