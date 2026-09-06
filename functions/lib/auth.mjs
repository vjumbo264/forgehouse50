// Authentication & session helpers — Workers-native, Web Crypto only.
//
// Password hashing: PBKDF2-SHA256, 100,000 iterations, 16-byte salt.
// Chosen because it is implemented natively by the Workers runtime via
// crypto.subtle (no native modules, no wasm build step) and is a
// well-understood KDF. Stored format: pbkdf2$100000$salt_hex$hash_hex.

import { randomHex, uuid, nowIso, getSessionToken } from './http.mjs';

const PBKDF2_ITERATIONS = 100000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, rolling
export const OTP_TTL_MS = 10 * 60 * 1000;         // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, iterStr, saltHex, hashHex] = stored.split('$');
    if (scheme !== 'pbkdf2') return false;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: parseInt(iterStr, 10) }, key, 256);
    const candidate = bytesToHex(new Uint8Array(bits));
    // constant-time comparison
    if (candidate.length !== hashHex.length) return false;
    let diff = 0;
    for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ hashHex.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}

export function generateOtp() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return (arr[0] % 1000000).toString().padStart(6, '0');
}

export async function createSession(db, userId, userAgent = '') {
  const token = randomHex(32);
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db.prepare(
    'INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)'
  ).bind(token, userId, expires, userAgent).run();
  return { token, expires };
}

// Resolve the session cookie to a user. Returns null when unauthenticated.
export async function getUser(request, env) {
  const token = getSessionToken(request);
  if (!token) return null;
  const row = await env.DB.prepare(`
    SELECT s.id AS session_id, s.expires_at, p.id, p.email, p.name, p.avatar_url, p.role, p.email_verified, p.created_at
    FROM sessions s JOIN profiles p ON p.id = s.user_id
    WHERE s.id = ?`).bind(token).first();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
    return null;
  }
  // rolling refresh of last_seen
  await env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").bind(nowIso(), token).run();
  return row;
}

export async function requireUser(request, env) {
  const user = await getUser(request, env);
  if (!user) return { user: null, response: new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) };
  return { user, response: null };
}

export function requireAdmin(user) {
  return user && user.role === 'admin';
}

export async function destroySession(db, token) {
  if (token) await db.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
}

export { uuid, nowIso };
