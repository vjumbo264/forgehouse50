// DELETE /api/admin/users/:id or POST /api/admin/users/:id
import { json, badRequest, forbidden, notFound, readJson } from '../../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../../lib/auth.mjs';
import { deleteUserRecord } from '../../../lib/delete_user.mjs';

async function handleDelete({ request, env, params }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const userId = String(params.id || '').trim();
  if (!userId) return badRequest('User ID is required');

  const body = (await readJson(request)) || {};
  const url = new URL(request.url);
  const confirm = String(body.confirm || body.confirm_name || body.confirm_email || url.searchParams.get('confirm') || '').trim();
  if (!confirm) return badRequest('Confirmation required');

  const target = await env.DB.prepare('SELECT id, name, surname, email, role FROM profiles WHERE id = ?').bind(userId).first();
  if (!target) return notFound('User not found');

  try {
    const result = await deleteUserRecord(env.DB, user.id, target, confirm);
    return json({ ok: true, deleted_user_id: userId, display_name: result.display_name });
  } catch (err) {
    return badRequest(err.message);
  }
}

export async function onRequestDelete(ctx) { return handleDelete(ctx); }
export async function onRequestPost(ctx) { return handleDelete(ctx); }
