// POST /api/auth/signup — email + password → create unverified profile → OTP via Resend.
import { json, badRequest, conflict, readJson, uuid, nowIso } from '../../lib/http.mjs';
import { hashPassword, generateOtp, OTP_TTL_MS } from '../../lib/auth.mjs';
import { sendEmail, otpEmailHtml } from '../../lib/email.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const name = String(body.name || '').trim().slice(0, 80);

  if (!EMAIL_RE.test(email)) return badRequest('A valid email address is required');
  if (password.length < 8) return badRequest('Password must be at least 8 characters');

  const existing = await env.DB.prepare('SELECT id, email_verified FROM profiles WHERE email = ?').bind(email).first();
  if (existing && existing.email_verified) return conflict('An account with this email already exists');

  const passwordHash = await hashPassword(password);
  let userId;
  if (existing) {
    // Re-signup before verification: refresh credentials.
    userId = existing.id;
    await env.DB.prepare("UPDATE profiles SET password_hash = ?, name = ?, updated_at = ? WHERE id = ?")
      .bind(passwordHash, name, nowIso(), userId).run();
  } else {
    userId = uuid();
    await env.DB.prepare('INSERT INTO profiles (id, email, password_hash, name) VALUES (?, ?, ?, ?)')
      .bind(userId, email, passwordHash, name).run();
  }

  // Invalidate previous OTPs, then create a fresh one.
  await env.DB.prepare("DELETE FROM otp_codes WHERE user_id = ? AND purpose = 'verify_email'").bind(userId).run();
  const code = generateOtp();
  const expires = new Date(Date.now() + OTP_TTL_MS).toISOString();
  await env.DB.prepare("INSERT INTO otp_codes (id, user_id, code, purpose, expires_at) VALUES (?, ?, ?, 'verify_email', ?)")
    .bind(uuid(), userId, code, expires).run();

  const sent = await sendEmail(env, { to: email, subject: 'Your ForgeHouse 50 verification code', html: otpEmailHtml(code, name) });

  return json({ ok: true, user_id: userId, email, email_sent: sent.ok, ...(sent.ok ? {} : { email_error: sent.error }) });
}
