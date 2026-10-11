// POST /api/admin/login — dedicated admin authentication.
// Verifies PBKDF2-SHA256 password, enforces 5-attempt/15-minute brute-force lockout,
// and issues a 12-hour admin session cookie/token.

import { json, badRequest, unauthorized, readJson, setSessionCookie } from '../../lib/http.mjs';
import {
  verifyPassword,
  createAdminSession,
  checkAdminLockout,
  recordAdminAttempt,
} from '../../lib/auth.mjs';

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');

  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password) return badRequest('Username and password are required');

  const clientIp = request.headers.get('CF-Connecting-IP') ||
                   request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
                   '127.0.0.1';

  // 1. Brute-force protection check (5 failed attempts within 15 mins -> locked out)
  const lockout = await checkAdminLockout(env.DB, username, clientIp);
  if (lockout.locked) {
    return json({
      error: `Too many attempts, try again later in ${lockout.remainingMinutes} minutes`,
      locked: true,
      retry_after_seconds: lockout.remainingSeconds,
    }, 429, {
      'Retry-After': String(lockout.remainingSeconds),
    });
  }

  // 2. Query admin credential
  const admin = await env.DB.prepare(
    'SELECT id, username, password_hash FROM admin_credentials WHERE username = ? COLLATE NOCASE'
  ).bind(username).first();

  let valid = false;
  if (admin && admin.password_hash) {
    valid = await verifyPassword(password, admin.password_hash);
  } else {
    // Constant-time dummy verification to protect against timing analysis
    const dummyHash = 'pbkdf2$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';
    await verifyPassword(password, dummyHash);
    valid = false;
  }

  if (!valid) {
    // Record failed attempt for both username and IP
    await recordAdminAttempt(env.DB, username, clientIp, false);
    return unauthorized('Invalid username or password');
  }

  // Record successful login
  await recordAdminAttempt(env.DB, username, clientIp, true);

  // 3. Issue 12-hour admin session
  const userAgent = request.headers.get('User-Agent') || '';
  const { token, expires } = await createAdminSession(env.DB, admin.id, userAgent);

  return json({
    ok: true,
    token,
    role: 'admin',
    username: admin.username,
    expires_at: expires,
  }, 200, {
    'Set-Cookie': setSessionCookie(token, expires),
  });
}
