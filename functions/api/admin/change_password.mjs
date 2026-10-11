// POST /api/admin/change_password — change admin password & invalidate other sessions.
import { json, badRequest, forbidden, unauthorized, readJson } from '../../lib/http.mjs';
import { requireUser, requireAdmin, verifyPassword, hashPassword, nowIso } from '../../lib/auth.mjs';

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');

  const currentPassword = String(body.current_password || '');
  const newPassword = String(body.new_password || '');

  if (!currentPassword || !newPassword) {
    return badRequest('Current password and new password are required');
  }

  // Minimum length 12 and basic strength check
  if (newPassword.length < 12) {
    return badRequest('New password must be at least 12 characters long');
  }
  const hasUpperOrLower = /[a-zA-Z]/.test(newPassword);
  const hasDigitOrSpecial = /[\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);
  if (!hasUpperOrLower || !hasDigitOrSpecial) {
    return badRequest('New password must contain a mix of letters and numbers or symbols');
  }

  // Verify current password against stored credential
  const admin = await env.DB.prepare(
    'SELECT id, username, password_hash FROM admin_credentials WHERE id = ?'
  ).bind(user.id).first();

  if (!admin || !(await verifyPassword(currentPassword, admin.password_hash))) {
    return badRequest('Current password is incorrect');
  }

  // Hash new password using PBKDF2-SHA256
  const newHash = await hashPassword(newPassword);
  const [,, saltHex] = newHash.split('$');

  // Update password in DB and invalidate all OTHER sessions for this admin
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE admin_credentials SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?'
    ).bind(newHash, saltHex, nowIso(), admin.id),
    // Invalidate all other admin sessions, keep current active session
    env.DB.prepare(
      'DELETE FROM admin_sessions WHERE admin_id = ? AND id != ?'
    ).bind(admin.id, user.session_id),
  ]);

  return json({
    ok: true,
    message: 'Password successfully changed. Other admin sessions have been invalidated.',
  });
}
