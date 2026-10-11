// POST /api/admin/purge_user — admin-only cascading user deletion (legacy endpoint).
import { json, badRequest, forbidden, notFound, readJson } from '../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../lib/auth.mjs';
import { deleteUserRecord } from '../../lib/delete_user.mjs';

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin only');

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');

  const userId = String(body.user_id || '').trim();
  const confirm = String(body.confirm_email || body.confirm || '').trim();

  if (!userId) return badRequest('user_id is required');
  if (!confirm) return badRequest('confirm_email is required');

  const target = await env.DB.prepare('SELECT id, name, surname, email, role FROM profiles WHERE id = ?').bind(userId).first();
  if (!target) return notFound('User not found');

  try {
    const result = await deleteUserRecord(env.DB, user.id, target, confirm);
    return json({
      ok: true,
      deleted_user_id: userId,
      display_name: result.display_name,
      audit_id: result.audit_id,
    });
  } catch (err) {
    return badRequest(err.message);
  }
}
