// POST /api/auth/forgot_password — send password reset OTP code.
import { json, badRequest, readJson, uuid } from "../../lib/http.mjs";
import { generateOtp, OTP_TTL_MS } from "../../lib/auth.mjs";
import { sendEmail, resetPasswordEmailHtml } from "../../lib/email.mjs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_COOLDOWN_MS = 30 * 1000;

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return badRequest("Invalid JSON body");

  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return badRequest("A valid email address is required");

  const nowMs = typeof env.NOW_MS === "number" ? env.NOW_MS : Date.now();
  const user = await env.DB.prepare("SELECT id, name, email_verified FROM profiles WHERE email = ?")
    .bind(email)
    .first();

  // Always respond with success when no account matches to prevent account enumeration
  if (user) {
    const recent = await env.DB.prepare(
      `SELECT created_at, consumed_at FROM otp_codes
       WHERE user_id = ? AND purpose = 'password_reset'
       ORDER BY created_at DESC LIMIT 1`
    ).bind(user.id).first();
    if (recent && !recent.consumed_at) {
      const createdMs = Date.parse(recent.created_at);
      if (!Number.isNaN(createdMs) && (nowMs - createdMs) < RESEND_COOLDOWN_MS) {
        const waitSec = Math.max(1, Math.ceil((RESEND_COOLDOWN_MS - (nowMs - createdMs)) / 1000));
        return json(
          { ok: false, error: `Please wait ${waitSec}s before requesting another reset code.` },
          429,
          { "Retry-After": String(waitSec) },
        );
      }
    }

    await env.DB.prepare("DELETE FROM otp_codes WHERE user_id = ? AND purpose = 'password_reset'")
      .bind(user.id)
      .run();

    const otpId = uuid();
    const code = generateOtp();
    const expires = new Date(nowMs + OTP_TTL_MS).toISOString();
    const createdAt = new Date(nowMs).toISOString();

    await env.DB.prepare(
      "INSERT INTO otp_codes (id, user_id, code, purpose, expires_at, created_at) VALUES (?, ?, ?, 'password_reset', ?, ?)"
    ).bind(otpId, user.id, code, expires, createdAt).run();

    const mailResult = await sendEmail(env, {
      to: email,
      subject: "Reset your ForgeHouse 50 password",
      html: resetPasswordEmailHtml(code, user.name),
    });
    if (!mailResult?.ok) {
      await env.DB.prepare("DELETE FROM otp_codes WHERE id = ?").bind(otpId).run();
      return json(
        { ok: false, error: "Could not send reset code email right now. Please try again shortly." },
        503,
      );
    }
  }

  return json({
    ok: true,
    message: "If an account exists for that email, a password reset code has been sent.",
  });
}
