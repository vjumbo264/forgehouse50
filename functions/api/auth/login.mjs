// POST /api/auth/login — email + password → session cookie.
import { json, badRequest, unavailable, readJson, setSessionCookie } from '../../lib/http.mjs';
import { verifyPassword, createSession } from '../../lib/auth.mjs';

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) return badRequest('Email and password are required');

  try {
    const user = await env.DB.prepare(
      'SELECT id, password_hash, email_verified, name, surname, role FROM profiles WHERE email = ?'
    ).bind(email).first();

    // Same message for unknown email and wrong password (no account enumeration).
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return json({ error: 'Invalid email or password', reason: 'invalid_credentials' }, 401);
    }
    if (!user.email_verified) {
      return json({
        error: 'Email not verified',
        reason: 'email_not_verified',
        needs_verification: true,
        email,
      }, 403);
    }

    const nowMs = typeof env.NOW_MS === 'number' ? env.NOW_MS : Date.now();
    const { token, expires } = await createSession(
      env.DB,
      user.id,
      request.headers.get('User-Agent') || '',
      nowMs,
    );
    return json(
      {
        ok: true,
        id: user.id,
        name: user.name,
        surname: user.surname || '',
        role: user.role || 'member',
        token,
        expires_at: expires,
      },
      200,
      { 'Set-Cookie': setSessionCookie(token, expires) },
    );
  } catch (err) {
    console.error('Member login error:', err);
    return unavailable('Server problem, please try again', 'server_error');
  }
}
