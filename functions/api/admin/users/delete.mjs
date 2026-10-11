// POST /api/admin/users/delete — single or bulk deletion (max 50 users per request).
import { json, badRequest, forbidden, notFound, readJson } from '../../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../../lib/auth.mjs';
import { deleteUserRecord } from '../../../lib/delete_user.mjs';

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');

  // Support single deletion format: { id, confirm }
  if (body.id && !body.users && !body.user_ids) {
    const userId = String(body.id).trim();
    const confirm = String(body.confirm || body.confirm_name || body.confirm_email || '').trim();
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

  // Bulk deletion format: { users: [ { id, confirm } ] } or { user_ids: [...], confirm: ... }
  let userList = [];
  if (Array.isArray(body.users)) {
    userList = body.users;
  } else if (Array.isArray(body.user_ids)) {
    userList = body.user_ids.map(id => ({ id, confirm: body.confirm }));
  } else {
    return badRequest("Expected 'id' or array of 'users'/'user_ids'");
  }

  if (userList.length === 0) return badRequest('Empty user list');
  if (userList.length > 50) return badRequest('Maximum 50 users per bulk delete request');

  const deleted = [];
  const errors = [];

  for (const item of userList) {
    const userId = String(item.id || item.user_id || '').trim();
    const confirm = String(item.confirm || body.confirm || '').trim();
    if (!userId) continue;

    const target = await env.DB.prepare('SELECT id, name, surname, email, role FROM profiles WHERE id = ?').bind(userId).first();
    if (!target) {
      errors.push({ id: userId, error: 'User not found' });
      continue;
    }

    try {
      const result = await deleteUserRecord(env.DB, user.id, target, confirm);
      deleted.push({ id: userId, display_name: result.display_name });
    } catch (err) {
      errors.push({ id: userId, error: err.message });
    }
  }

  return json({
    ok: errors.length === 0,
    deleted_count: deleted.length,
    deleted,
    errors,
  });
}
