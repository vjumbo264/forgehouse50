// POST /api/auth/verify — check 6-digit OTP, mark verified, create session.
import { json, badRequest, forbidden, readJson, setSessionCookie } from '../../lib/http.mjs';
import { createSession, OTP_MAX_ATTEMPTS, nowIso } from '../../lib/auth.mjs';
import { getProgrammeConfig, addDays, REGISTRATION_CLOSED_MESSAGE } from '../../lib/programme.mjs';

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const email = String(body.email || '').trim().toLowerCase();
  const code = String(body.code || '').trim();
  if (!email || !/^\d{6}$/.test(code)) return badRequest('Email and 6-digit code are required');

  const user = await env.DB.prepare('SELECT id, email_verified, programme_start_date, created_at FROM profiles WHERE email = ?').bind(email).first();
  if (!user) return badRequest('No account found for that email');

  // programme_launch_and_finale_v1 / task-l03: join-window enforcement at the
  // account-activation boundary. If the window has closed and this account
  // was created after it closed (only possible via a race — signup is gated),
  // refuse. An account created BEFORE the close may still verify, but its
  // personal Day 1 is CLAMPED to the last join day instead of today: this is
  // what makes the Part-B end-date computation exact — no participant's
  // schedule can end later than day50Date(lastJoinDay), so the end date
  // computed at window close stays valid for everyone, forever.
  const cfg = await getProgrammeConfig(env.DB);
  let anchorDate = new Date().toISOString().slice(0, 10);
  if (!user.programme_start_date && cfg.started && cfg.join_window_closes_at
      && anchorDate >= cfg.join_window_closes_at) {
    const createdDate = String(user.created_at || '').slice(0, 10);
    if (createdDate && createdDate >= cfg.join_window_closes_at) {
      return forbidden(REGISTRATION_CLOSED_MESSAGE);
    }
    const lastJoinDay = addDays(cfg.join_window_closes_at, -1);
    if (anchorDate > lastJoinDay) anchorDate = lastJoinDay;
  }

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
    // per_user_calendar_and_quiz_v1: OTP verification is THE account-active
    // trigger — anchor this user's personal Day 1 to today (COALESCE so a
    // backfilled/re-verifying user keeps their original start date).
    env.DB.prepare(
      "UPDATE profiles SET email_verified = 1, updated_at = ?, programme_start_date = COALESCE(programme_start_date, ?) WHERE id = ?"
    ).bind(nowIso(), anchorDate, user.id),
  ]);

  const { token, expires } = await createSession(env.DB, user.id, request.headers.get('User-Agent') || '');
  return json({ ok: true }, 200, { 'Set-Cookie': setSessionCookie(token, expires) });
}
