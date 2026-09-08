// POST /api/admin/purge_user — admin-only cascading user deletion.
//
// Body: { user_id: string, confirm_email: string }
// The admin must pass the user's current email as `confirm_email` — a
// safety guard against pasting the wrong id. The endpoint refuses to
// delete an admin account this way (protects against locking everyone
// out) unless force_admin=true is also passed.
//
// Deletes explicitly, in FK-safe child->parent order, every table that
// references profiles(id). All child tables already carry
// ON DELETE CASCADE on their user_id FK, but this routine issues an
// explicit DELETE per table so the audit trail records exactly how many
// rows were removed from each — a raw cascade would swallow that detail.
//
// D1 does not support multi-statement transactions across separate
// prepare/bind calls, but env.DB.batch() runs a list of prepared
// statements atomically. All deletes are batched.

import { json, badRequest, unauthorized, forbidden, notFound, readJson } from '../../lib/http.mjs';
import { getUser } from '../../lib/auth.mjs';

const CHILD_TABLES = [
  'reading_progress',
  'audio_progress',
  'notes',
  'bookmarks',
  'highlights',
  'user_badges',
  'points',
  'sessions',
  'otp_codes',
  'leaderboard_snapshots',
];

export async function onRequestPost({ request, env }) {
  const me = await getUser(request, env);
  if (!me) return unauthorized('Not signed in');
  if (me.role !== 'admin') return forbidden('Admin only');

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const userId = String(body.user_id || '').trim();
  const confirmEmail = String(body.confirm_email || '').trim().toLowerCase();
  const forceAdmin = body.force_admin === true;
  if (!userId) return badRequest('user_id is required');
  if (!confirmEmail) return badRequest('confirm_email is required');

  const target = await env.DB.prepare('SELECT id, email, role FROM profiles WHERE id = ?').bind(userId).first();
  if (!target) return notFound('User not found');
  if (String(target.email).toLowerCase() !== confirmEmail) {
    return badRequest('confirm_email does not match the target user');
  }
  if (target.role === 'admin' && !forceAdmin) {
    return forbidden('Target is an admin; pass force_admin=true to confirm');
  }

  // Pre-count each child table for the audit trail; then delete; then delete profile.
  const counts = {};
  for (const t of CHILD_TABLES) {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE user_id = ?`).bind(userId).first();
    counts[t] = row?.c ?? 0;
  }

  // Atomic batch: every DELETE, then the profile row itself.
  const stmts = CHILD_TABLES.map(t =>
    env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(userId)
  );
  stmts.push(env.DB.prepare('DELETE FROM profiles WHERE id = ?').bind(userId));
  await env.DB.batch(stmts);

  // Post-check: confirm zero rows remain anywhere.
  const orphans = {};
  for (const t of CHILD_TABLES) {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE user_id = ?`).bind(userId).first();
    orphans[t] = row?.c ?? 0;
  }
  const profileGone = !(await env.DB.prepare('SELECT 1 FROM profiles WHERE id = ?').bind(userId).first());

  return json({
    ok: true,
    deleted_user_id: userId,
    deleted_email: target.email,
    deleted_role: target.role,
    rows_deleted_by_table: counts,
    orphans_after: orphans,
    profile_gone: profileGone,
  });
}
