// POST /api/auth/forgot_password — send password reset OTP code.
import { json, badRequest, readJson, uuid } from "../../lib/http.mjs";
import { generateOtp, OTP_TTL_MS } from "../../lib/auth.mjs";
import { sendEmail, resetPasswordEmailHtml } from "../../lib/email.mjs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return badRequest("Invalid JSON body");
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return badRequest("A valid email address is required");

  const user = await env.DB.prepare("SELECT id, name, email_verified FROM profiles WHERE email = ?").bind(email).first();

  // Always respond with success to prevent account enumeration
  if (user) {
    await env.DB.prepare("DELETE FROM otp_codes WHERE user_id = ? AND purpose = 'password_reset'").bind(user.id).run();

    const code = generateOtp();
    const expires = new Date(Date.now() + OTP_TTL_MS).toISOString();

    await env.DB.prepare(
      "INSERT INTO otp_codes (id, user_id, code, purpose, expires_at) VALUES (?, ?, ?, 'password_reset', ?)"
    ).bind(uuid(), user.id, code, expires).run();

    await sendEmail(env, {
      to: email,
      subject: "Reset your ForgeHouse 50 password",
      html: resetPasswordEmailHtml(code, user.name)
    });
  }

  return json({
    ok: true,
    message: "If an account exists for that email, a password reset code has been sent."
  });
}
