// Authentication & session helpers — Workers-native, Web Crypto only.
// Password hashing: PBKDF2-SHA256, 100,000 iterations, 16-byte salt.
// Chosen because it is implemented natively by the Workers runtime via
// crypto.subtle (no native modules, no wasm build step).

import { randomHex, uuid, nowIso, getSessionToken, json, unavailable } from './http.mjs';

export const PBKDF2_ITERATIONS = 100000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, rolling
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
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 4) return false;
  const [scheme, iterStr, saltHex, hashHex] = parts;
  if (scheme !== 'pbkdf2') return false;
  const iterations = Number.parseInt(iterStr, 10);
  if (!Number.isFinite(iterations) || iterations <= 0 || String(iterations) !== iterStr) return false;
  if (!/^[0-9a-f]{16,}$/i.test(saltHex) || saltHex.length % 2 !== 0) return false;
  if (!/^[0-9a-f]{64}$/i.test(hashHex)) return false;

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations }, key, 256);
  const candidate = bytesToHex(new Uint8Array(bits));
  const storedHex = hashHex.toLowerCase();
  if (candidate.length !== storedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ storedHex.charCodeAt(i);
  return diff === 0;
}

export function generateOtp() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return (arr[0] % 1000000).toString().padStart(6, '0');
}

export async function createSession(db, userId, userAgent = '', nowMs = Date.now()) {
  const token = randomHex(32);
  const createdIso = new Date(nowMs).toISOString();
  const expires = new Date(nowMs + SESSION_TTL_MS).toISOString();
  await db.prepare(
    'INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(token, userId, expires, createdIso, createdIso, userAgent).run();
  return { token, expires };
}

export async function createAdminSession(db, adminId, userAgent = '', nowMs = Date.now()) {
  const token = randomHex(32);
  const createdIso = new Date(nowMs).toISOString();
  const expires = new Date(nowMs + ADMIN_SESSION_TTL_MS).toISOString();
  await db.prepare(
    'INSERT INTO admin_sessions (id, admin_id, expires_at, created_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(token, adminId, expires, createdIso, createdIso, userAgent).run();
  return { token, expires };
}

function detectMalformedToken(request) {
  const auth = request.headers.get('Authorization') || '';
  if (/^Bearer\s+\S+/i.test(auth)) return true;
  const cookie = request.headers.get('Cookie') || '';
  return /(?:^|;\s*)fh50_session=[^;\s]+/.test(cookie);
}

// Resolve the session cookie/token to { user, reason }.
// Throws on DB/runtime errors so callers return 500/503 instead of masking faults as 401.
export async function resolveSession(request, env) {
  const token = getSessionToken(request);
  if (!token) {
    return {
      user: null,
      reason: detectMalformedToken(request) ? 'session_invalid' : 'session_missing',
    };
  }

  const nowMs = typeof env.NOW_MS === 'number' ? env.NOW_MS : Date.now();

  // 1. Check dedicated admin_sessions first (Part B — fixed 12-hour TTL)
  const adminRow = await env.DB.prepare(`
    SELECT s.id AS session_id, s.expires_at, s.last_seen_at, a.id AS admin_id, a.username
    FROM admin_sessions s JOIN admin_credentials a ON a.id = s.admin_id
    WHERE s.id = ?`).bind(token).first();

  if (adminRow) {
    const adminExpMs = Date.parse(adminRow.expires_at);
    if (!Number.isFinite(adminExpMs) || adminExpMs < nowMs) {
      await env.DB.prepare('DELETE FROM admin_sessions WHERE id = ?').bind(token).run();
      return { user: null, reason: 'session_expired' };
    }
    // Throttle refresh of last_seen to >= 15 min to avoid D1 write burn on chat polls
    const admSeenMs = adminRow.last_seen_at ? Date.parse(adminRow.last_seen_at) : 0;
    if (!Number.isFinite(admSeenMs) || !admSeenMs || (nowMs - admSeenMs) >= 15 * 60 * 1000) {
      await env.DB.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?')
        .bind(new Date(nowMs).toISOString(), token).run();
    }
    return {
      user: {
        session_id: adminRow.session_id,
        id: adminRow.admin_id,
        username: adminRow.username,
        name: adminRow.username,
        email: `${adminRow.username}@admin.local`,
        role: 'admin',
        is_admin: true,
        is_admin_credential: true,
      },
      reason: null,
    };
  }

  // 2. Check participant sessions (rolling 30-day TTL)
  const row = await env.DB.prepare(`
    SELECT s.id AS session_id, s.expires_at, s.last_seen_at, p.id, p.email, p.name, p.surname, p.avatar_url, p.avatar_id, p.role, p.email_verified, p.created_at, pic.version AS picture_version
    FROM sessions s JOIN profiles p ON p.id = s.user_id
    LEFT JOIN profile_pictures pic ON pic.user_id = p.id
    WHERE s.id = ?`).bind(token).first();
  if (!row) return { user: null, reason: 'session_invalid' };

  const expMs = Date.parse(row.expires_at);
  if (!Number.isFinite(expMs) || expMs < nowMs) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
    return { user: null, reason: 'session_expired' };
  }

  // Throttle rolling renewal (last_seen_at + expires_at) to >= 15 min to avoid D1 write burn on chat polls
  const memSeenMs = row.last_seen_at ? Date.parse(row.last_seen_at) : 0;
  if (!Number.isFinite(memSeenMs) || !memSeenMs || (nowMs - memSeenMs) >= 15 * 60 * 1000) {
    const newSeenIso = new Date(nowMs).toISOString();
    const newExpiresIso = new Date(nowMs + SESSION_TTL_MS).toISOString();
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
      .bind(newSeenIso, newExpiresIso, token).run();
  }

  // Part B Rule 4: Retire email-based admin. No email OTP login can ever grant admin rights.
  // Profile accounts are strictly participants.
  return {
    user: {
      ...row,
      role: 'member',
      is_admin: false,
      is_admin_credential: false,
    },
    reason: null,
  };
}

// Resolve the session cookie to a user or admin. Returns null when unauthenticated.
export async function getUser(request, env) {
  const { user } = await resolveSession(request, env);
  return user;
}

export async function requireUser(request, env) {
  try {
    const { user, reason } = await resolveSession(request, env);
    if (!user) {
      return {
        user: null,
        response: json({
          error: reason === 'session_expired' ? 'Session expired. Please sign in again.' : 'Not authenticated',
          reason: reason || 'session_invalid',
        }, 401),
      };
    }
    return { user, response: null };
  } catch (err) {
    console.error('Session verification error:', err);
    return {
      user: null,
      response: unavailable('Server problem, please try again', 'db_error'),
    };
  }
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
