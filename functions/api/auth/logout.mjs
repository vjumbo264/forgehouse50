// POST /api/auth/logout — delete session, clear cookie.
import { json, unavailable, clearSessionCookie, getSessionToken } from '../../lib/http.mjs';
import { destroySession } from '../../lib/auth.mjs';

export async function onRequestPost({ request, env }) {
  try {
    await destroySession(env.DB, getSessionToken(request));
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
  } catch (err) {
    console.error('Logout error:', err);
    return unavailable('Server problem, please try again', 'server_error');
  }
}
