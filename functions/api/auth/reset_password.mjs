// POST /api/auth/reset_password — verify reset OTP code and set new password.
import { json, badRequest, readJson, setSessionCookie, nowIso } from "../../lib/http.mjs";
import { hashPassword, createSession, OTP_MAX_ATTEMPTS } from "../../lib/auth.mjs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return badRequest("Invalid JSON body");

  const email = String(body.email || "").trim().toLowerCase();
  const code = String(body.code || "").trim();
  const newPassword = String(body.new_password || body.password || "");

  if (!email || !EMAIL_RE.test(email)) return badRequest("A valid email address is required");
  if (!/^\d{6}$/.test(code)) return badRequest("A 6-digit code is required");
  if (newPassword.length < 8) return badRequest("New password must be at least 8 characters");

  const user = await env.DB.prepare("SELECT id, name, email_verified FROM profiles WHERE email = ?").bind(email).first();
  if (!user) return badRequest("No account found for that email");

  const otp = await env.DB.prepare(
    `SELECT id, code, expires_at, consumed_at, attempts FROM otp_codes 
     WHERE user_id = ? AND purpose = 'password_reset' 
     ORDER BY created_at DESC LIMIT 1`
  ).bind(user.id).first();

  if (!otp || otp.consumed_at) return badRequest("No active reset code — request a new one");
  if (new Date(otp.expires_at).getTime() < Date.now()) return badRequest("That code has expired — request a new one");
  if (otp.attempts >= OTP_MAX_ATTEMPTS) return badRequest("Too many attempts — request a new code");

  if (otp.code !== code) {
    await env.DB.prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?").bind(otp.id).run();
    return badRequest("Incorrect code");
  }

  const passwordHash = await hashPassword(newPassword);
  const now = nowIso();

  await env.DB.batch([
    env.DB.prepare("UPDATE otp_codes SET consumed_at = ? WHERE id = ?").bind(now, otp.id),
    env.DB.prepare(
      "UPDATE profiles SET password_hash = ?, email_verified = 1, updated_at = ? WHERE id = ?"
    ).bind(passwordHash, now, user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
  ]);

  const { token, expires } = await createSession(env.DB, user.id, request.headers.get("User-Agent") || "");
  return json(
    { ok: true, name: user.name, message: "Password reset successfully" },
    200,
    { "Set-Cookie": setSessionCookie(token, expires) }
  );
}
