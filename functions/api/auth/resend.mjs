// POST /api/auth/resend — issue a fresh OTP (invalidates the previous one).
import { json, badRequest, readJson, uuid } from '../../lib/http.mjs';
import { generateOtp, OTP_TTL_MS } from '../../lib/auth.mjs';
import { sendEmail, otpEmailHtml } from '../../lib/email.mjs';

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const email = String(body.email || '').trim().toLowerCase();
  if (!email) return badRequest('Email is required');

  const user = await env.DB.prepare('SELECT id, name, email_verified FROM profiles WHERE email = ?').bind(email).first();
  // Always answer ok to avoid account enumeration; only send when a real unverified account exists.
  if (user && !user.email_verified) {
    await env.DB.prepare("DELETE FROM otp_codes WHERE user_id = ? AND purpose = 'verify_email'").bind(user.id).run();
    const code = generateOtp();
    const expires = new Date(Date.now() + OTP_TTL_MS).toISOString();
    await env.DB.prepare("INSERT INTO otp_codes (id, user_id, code, purpose, expires_at) VALUES (?, ?, ?, 'verify_email', ?)")
      .bind(uuid(), user.id, code, expires).run();
    await sendEmail(env, { to: email, subject: 'Your ForgeHouse 50 verification code', html: otpEmailHtml(code, user.name) });
  }
  return json({ ok: true });
}
