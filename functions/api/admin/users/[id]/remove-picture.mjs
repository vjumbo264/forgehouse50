// POST /api/admin/users/:id/remove-picture — Admin moderation of profile pictures
import { json, badRequest, forbidden, notFound, nowIso, uuid } from '../../../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../../../lib/auth.mjs';

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const userId = String(params.id || '').trim();
  if (!userId) return badRequest('User ID is required');

  const target = await env.DB.prepare('SELECT id, name, surname, email FROM profiles WHERE id = ?').bind(userId).first();
  if (!target) return notFound('Participant not found');

  const targetName = [target.name, target.surname].filter(Boolean).join(' ').trim() || target.email || target.id;

  // Remove profile picture from profile_pictures
  const res = await env.DB.prepare('DELETE FROM profile_pictures WHERE user_id = ?').bind(userId).run();

  // Audit record in admin_audit
  const auditId = uuid();
  await env.DB.prepare(
    'INSERT INTO admin_audit (id, admin_id, action, target_user_id, target_display_name, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(auditId, user.id, 'remove_picture', userId, targetName, nowIso()).run();

  return json({
    ok: true,
    user_id: userId,
    display_name: targetName,
    message: `Profile picture removed for ${targetName}. Reverted to illustration avatar.`,
  });
}
