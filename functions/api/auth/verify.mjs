// POST /api/auth/verify — check 6-digit OTP, mark verified, create session.
import { json, badRequest, readJson, setSessionCookie } from '../../lib/http.mjs';
import { createSession, OTP_MAX_ATTEMPTS, nowIso } from '../../lib/auth.mjs';

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const email = String(body.email || '').trim().toLowerCase();
  const code = String(body.code || '').trim();
  if (!email || !/^\d{6}$/.test(code)) return badRequest('Email and 6-digit code are required');

  const user = await env.DB.prepare('SELECT id, email_verified FROM profiles WHERE email = ?').bind(email).first();
  if (!user) return badRequest('No account found for that email');

  const otp = await env.DB.prepare(
    `SELECT id, code, expires_at, consumed_at, attempts FROM otp_codes
     WHERE user_id = ? AND purpose = 'verify_email'
     ORDER BY created_at DESC LIMIT 1`
  ).bind(user.id).first();

  if (!otp || otp.consumed_at) return badRequest('No active verification code — request a new one');
  if (new Date(otp.expires_at).getTime() < Date.now()) return badRequest('That code has expired — request a new one');
  if (otp.attempts >= OTP_MAX_ATTEMPTS) return badRequest('Too many attempts — request a new code');

  if (otp.code !== code) {
    await env.DB.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').bind(otp.id).run();
    return badRequest('Incorrect code');
  }

  await env.DB.batch([
    env.DB.prepare('UPDATE otp_codes SET consumed_at = ? WHERE id = ?').bind(nowIso(), otp.id),
    env.DB.prepare('UPDATE profiles SET email_verified = 1, updated_at = ? WHERE id = ?').bind(nowIso(), user.id),
  ]);

  const { token, expires } = await createSession(env.DB, user.id, request.headers.get('User-Agent') || '');
  return json({ ok: true }, 200, { 'Set-Cookie': setSessionCookie(token, expires) });
}
