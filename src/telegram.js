const config = require('./config');

/* Telegram Gateway API — https://core.telegram.org/gateway/api
   The Gateway generates and validates the code itself; we only carry the
   request_id between send and check. Every send is billed, so callers must
   pass the rate limits in otp.js first. */

async function call(method, body) {
  const res = await fetch(`${config.telegram.apiBase}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.telegram.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Telegram Gateway returned non-JSON (${res.status})`);
  }
}

const errorOf = (j) =>
  (j && (j.error || (j.result && j.result.error))) || 'Telegram Gateway rejected the request';

/** Ask the Gateway to deliver a code. Returns the request_id to verify against. */
async function sendVerification(phone) {
  const j = await call('sendVerificationMessage', {
    phone_number: phone,
    code_length: config.otp.length,
    ttl: config.telegram.ttlSeconds,
  });
  if (!j.ok || !j.result || !j.result.request_id) {
    const err = new Error(errorOf(j));
    err.gateway = j;
    throw err;
  }
  return j.result.request_id;
}

/**
 * Check a user-supplied code.
 * → { valid: true } | { valid: false, reason: 'expired' | 'max_attempts' | 'invalid' }
 */
async function checkVerification(requestId, code) {
  const j = await call('checkVerificationStatus', { request_id: requestId, code });
  const status = j?.result?.verification_status?.status;
  if (j.ok && status === 'code_valid') return { valid: true };
  if (status === 'code_max_attempts_exceeded') return { valid: false, reason: 'max_attempts' };
  if (status === 'expired') return { valid: false, reason: 'expired' };
  return { valid: false, reason: 'invalid' };
}

module.exports = {
  sendVerification,
  checkVerification,
  enabled: () => config.telegram.enabled,
};
