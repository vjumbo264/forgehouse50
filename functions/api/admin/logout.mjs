// POST /api/admin/logout — clear admin session.
import { json, clearSessionCookie, getSessionToken } from '../../lib/http.mjs';
import { destroySession } from '../../lib/auth.mjs';

export async function onRequestPost({ request, env }) {
  const token = getSessionToken(request);
  if (token) await destroySession(env.DB, token);
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}
