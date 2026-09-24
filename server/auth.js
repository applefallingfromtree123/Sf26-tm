// Password hashing (scrypt) and signed session tokens (HMAC-SHA256), no external deps.
import crypto from 'node:crypto';

const SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET && !process.env.SESSION_SECRET) console.warn('[auth] JWT_SECRET not set — sessions will reset when the server restarts');
const TOKEN_TTL = 1000 * 60 * 60 * 24 * 30; // 30 days

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  try {
    const [, saltHex, hashHex] = stored.split('$');
    const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
    const expected = Buffer.from(hashHex, 'hex');
    return expected.length === hash.length && crypto.timingSafeEqual(expected, hash);
  } catch { return false; }
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function signToken(username) {
  const body = b64({ u: username, exp: Date.now() + TOKEN_TTL });
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
export function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); if (p.exp < Date.now()) return null; return p.u; } catch { return null; }
}

// tiny in-memory rate limiter
const hits = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k);
  return arr.length <= max;
}
