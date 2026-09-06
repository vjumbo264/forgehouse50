// POST /api/auth/logout — delete session, clear cookie.
import { json, clearSessionCookie, getSessionToken } from '../../lib/http.mjs';
import { destroySession } from '../../lib/auth.mjs';

export async function onRequestPost({ request, env }) {
  await destroySession(env.DB, getSessionToken(request));
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}
