// POST /api/admin/users/:id/delete — delete single participant permanently.
import { json, badRequest, forbidden, notFound, readJson } from '../../../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../../../lib/auth.mjs';
import { deleteUserRecord } from '../../../../lib/delete_user.mjs';

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const userId = String(params.id || '').trim();
  if (!userId) return badRequest('User ID is required');

  const body = (await readJson(request)) || {};
  // Accept confirm: true, or backward-compatible string confirmation
  const confirm = body.confirm === true ? true : (body.confirm ?? body.confirm_name ?? body.confirm_email ?? '');
  if (confirm !== true && !String(confirm).trim()) {
    return badRequest('Confirmation required (e.g. { confirm: true })');
  }

  const target = await env.DB.prepare('SELECT id, name, surname, email, role FROM profiles WHERE id = ?').bind(userId).first();
  if (!target) return notFound('User not found');

  try {
    const result = await deleteUserRecord(env.DB, user.id, target, confirm);
    return json({ ok: true, deleted_user_id: userId, display_name: result.display_name });
  } catch (err) {
    return badRequest(err.message);
  }
}
