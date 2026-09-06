// POST /api/auth/login — email + password → session cookie.
import { json, badRequest, readJson, setSessionCookie } from '../../lib/http.mjs';
import { verifyPassword, createSession } from '../../lib/auth.mjs';

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) return badRequest('Email and password are required');

  const user = await env.DB.prepare(
    'SELECT id, password_hash, email_verified, name, role FROM profiles WHERE email = ?'
  ).bind(email).first();

  // Same message for unknown email and wrong password (no account enumeration).
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return json({ error: 'Invalid email or password' }, 401);
  }
  if (!user.email_verified) {
    return json({ error: 'Email not verified', needs_verification: true, email }, 403);
  }

  const { token, expires } = await createSession(env.DB, user.id, request.headers.get('User-Agent') || '');
  return json({ ok: true, name: user.name, role: user.role }, 200, { 'Set-Cookie': setSessionCookie(token, expires) });
}
