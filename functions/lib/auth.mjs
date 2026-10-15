// Authentication & session helpers — Workers-native, Web Crypto only.
// Password hashing: PBKDF2-SHA256, 100,000 iterations, 16-byte salt.
// Chosen because it is implemented natively by the Workers runtime via
// crypto.subtle (no native modules, no wasm build step).

import { randomHex, uuid, nowIso, getSessionToken } from './http.mjs';

export const PBKDF2_ITERATIONS = 100000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, rolling
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours fixed
export const OTP_TTL_MS = 10 * 60 * 1000;         // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;

export const ADMIN_LOCKOUT_MAX_ATTEMPTS = 5;
export const ADMIN_LOCKOUT_WINDOW_MINUTES = 15;

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

export async function createAdminSession(db, adminId, userAgent = '') {
  const token = randomHex(32);
  const expires = new Date(Date.now() + ADMIN_SESSION_TTL_MS).toISOString();
  await db.prepare(
    'INSERT INTO admin_sessions (id, admin_id, expires_at, user_agent) VALUES (?, ?, ?, ?)'
  ).bind(token, adminId, expires, userAgent).run();
  return { token, expires };
}

// Resolve the session cookie to a user or admin. Returns null when unauthenticated.
export async function getUser(request, env) {
  const token = getSessionToken(request);
  if (!token) return null;

  // 1. Check dedicated admin_sessions first (Part B)
  const adminRow = await env.DB.prepare(`
    SELECT s.id AS session_id, s.expires_at, a.id AS admin_id, a.username
    FROM admin_sessions s JOIN admin_credentials a ON a.id = s.admin_id
    WHERE s.id = ?`).bind(token).first();

  if (adminRow) {
    if (new Date(adminRow.expires_at).getTime() < Date.now()) {
      await env.DB.prepare('DELETE FROM admin_sessions WHERE id = ?').bind(token).run();
      return null;
    }
    // rolling refresh of last_seen
    await env.DB.prepare("UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?").bind(nowIso(), token).run();
    return {
      session_id: adminRow.session_id,
      id: adminRow.admin_id,
      username: adminRow.username,
      name: adminRow.username,
      email: `${adminRow.username}@admin.local`,
      role: 'admin',
      is_admin: true,
      is_admin_credential: true,
    };
  }

  // 2. Check participant sessions
  const row = await env.DB.prepare(`
    SELECT s.id AS session_id, s.expires_at, p.id, p.email, p.name, p.surname, p.avatar_url, p.avatar_id, p.role, p.email_verified, p.created_at, pic.version AS picture_version
    FROM sessions s JOIN profiles p ON p.id = s.user_id
    LEFT JOIN profile_pictures pic ON pic.user_id = p.id
    WHERE s.id = ?`).bind(token).first();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
    return null;
  }
  // rolling refresh of last_seen
  await env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").bind(nowIso(), token).run();

  // Part B Rule 4: Retire email-based admin. No email OTP login can ever grant admin rights.
  // Profile accounts are strictly participants.
  return {
    ...row,
    role: 'member',
    is_admin: false,
    is_admin_credential: false,
  };
}

export async function requireUser(request, env) {
  const user = await getUser(request, env);
  if (!user) return { user: null, response: new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) };
  return { user, response: null };
}

export function requireAdmin(user) {
  return !!(user && user.role === 'admin' && user.is_admin_credential === true);
}

export async function destroySession(db, token) {
  if (token) {
    await db.batch([
      db.prepare('DELETE FROM sessions WHERE id = ?').bind(token),
      db.prepare('DELETE FROM admin_sessions WHERE id = ?').bind(token),
    ]);
  }
}

export async function checkAdminLockout(db, username, ip) {
  const windowTime = new Date(Date.now() - ADMIN_LOCKOUT_WINDOW_MINUTES * 60 * 1000).toISOString();
  const row = await db.prepare(`
    SELECT COUNT(*) AS failed_count, MAX(attempted_at) AS last_attempt
    FROM admin_login_attempts
    WHERE (identifier = ? OR identifier = ?)
      AND success = 0
      AND attempted_at >= ?
  `).bind(username.toLowerCase(), ip, windowTime).first();

  const failedCount = row?.failed_count ?? 0;
  if (failedCount >= ADMIN_LOCKOUT_MAX_ATTEMPTS) {
    const lastAttemptMs = row?.last_attempt ? new Date(row.last_attempt).getTime() : Date.now();
    const remainingMs = Math.max(0, (lastAttemptMs + ADMIN_LOCKOUT_WINDOW_MINUTES * 60 * 1000) - Date.now());
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));
    const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
    return { locked: true, remainingMinutes, remainingSeconds };
  }
  return { locked: false, failedCount };
}

export async function recordAdminAttempt(db, username, ip, success) {
  const now = nowIso();
  const stmts = [
    db.prepare('INSERT INTO admin_login_attempts (id, identifier, attempted_at, success) VALUES (?, ?, ?, ?)')
      .bind(uuid(), username.toLowerCase(), now, success ? 1 : 0),
    db.prepare('INSERT INTO admin_login_attempts (id, identifier, attempted_at, success) VALUES (?, ?, ?, ?)')
      .bind(uuid(), ip, now, success ? 1 : 0),
  ];
  await db.batch(stmts);
}

export { uuid, nowIso };
