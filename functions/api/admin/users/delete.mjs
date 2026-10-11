// POST /api/admin/users/delete — single or batch deletion (max 50 users per request).
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
  if (body.id && !body.ids && !body.users && !body.user_ids) {
    const userId = String(body.id).trim();
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

  // Batch deletion format: { ids: [...], confirm_word: "DELETE" }
  const rawIds = body.ids || body.user_ids || (Array.isArray(body.users) ? body.users.map(u => u.id || u.user_id) : null);
  if (!Array.isArray(rawIds)) {
    return badRequest("Expected 'id' or array of 'ids'");
  }

  const ids = rawIds.map(i => String(i || '').trim()).filter(Boolean);
  if (ids.length === 0) return badRequest('Empty id list');
  if (ids.length > 50) return badRequest('Maximum 50 users per batch delete request');

  const confirmWord = String(body.confirm_word || body.confirm || '').trim().toUpperCase();
  if (confirmWord !== 'DELETE') {
    return badRequest('Confirmation word DELETE required');
  }

  const results = [];
  for (const userId of ids) {
    if (!userId) continue;

    // Check target existence
    const target = await env.DB.prepare('SELECT id, name, surname, email, role FROM profiles WHERE id = ?').bind(userId).first();
    if (!target) {
      results.push({ id: userId, status: 'skipped', reason: 'User not found' });
      continue;
    }

    // Protection rules: caller or admins cannot be deleted
    if (target.id === user.id) {
      results.push({ id: userId, status: 'skipped', reason: 'Admins cannot delete their own account', display_name: target.name });
      continue;
    }
    if (target.role === 'admin') {
      results.push({ id: userId, status: 'skipped', reason: 'Admin accounts cannot be deleted', display_name: target.name });
      continue;
    }

    try {
      const delRes = await deleteUserRecord(env.DB, user.id, target, true);
      results.push({ id: userId, status: 'deleted', display_name: delRes.display_name });
    } catch (err) {
      results.push({ id: userId, status: 'failed', error: err.message, display_name: target.name });
    }
  }

  const deletedCount = results.filter(r => r.status === 'deleted').length;
  const skippedCount = results.filter(r => r.status === 'skipped').length;
  const failedCount = results.filter(r => r.status === 'failed').length;

  return json({
    ok: true,
    total: ids.length,
    deleted_count: deletedCount,
    skipped_count: skippedCount,
    failed_count: failedCount,
    results,
    deleted: results.filter(r => r.status === 'deleted'),
    errors: results.filter(r => r.status !== 'deleted'),
  });
}
