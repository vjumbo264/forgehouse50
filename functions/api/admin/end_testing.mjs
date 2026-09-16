// POST /api/admin/end_testing — "End Testing Phase & Reset".
// testing_phase_and_reader_fixes_v1 / ISSUE 1: closes the open testing
// sandbox by wiping EVERY non-admin user and all their per-user rows, in one
// atomic batch, reusing the exact cascading-deletion table list from
// purge_user.mjs (migration_brevo_v1 / launch-wipe). Admin accounts and all
// shared/global data (reading_assignments, quiz question bank,
// programme_config) are untouched. Requires confirm:'END_TESTING'.
// Does NOT start the programme — that stays a separate admin action.
import { json, badRequest, unauthorized, forbidden, readJson } from '../../lib/http.mjs';
import { getUser } from '../../lib/auth.mjs';

const CHILD_TABLES = ['reading_progress','quiz_attempts','user_reading_days','audio_progress','notes','bookmarks','highlights','user_badges','points','sessions','otp_codes','leaderboard_snapshots','final_rank_acks'];

export async function onRequestPost({ request, env }) {
  const me = await getUser(request, env);
  if (!me) return unauthorized('Not signed in');
  if (me.role !== 'admin') return forbidden('Admin only');
  const body = await readJson(request);
  if (body?.confirm !== 'END_TESTING') {
    return badRequest("Confirmation required — resend with confirm: 'END_TESTING'. Nothing was deleted.");
  }
  const { results: targets } = await env.DB.prepare("SELECT id, email FROM profiles WHERE role != 'admin'").all();
  const stmts = [];
  const perUser = [];
  for (const t of targets || []) {
    for (const tbl of CHILD_TABLES) stmts.push(env.DB.prepare(`DELETE FROM ${tbl} WHERE user_id = ?`).bind(t.id));
    stmts.push(env.DB.prepare('DELETE FROM profiles WHERE id = ?').bind(t.id));
    perUser.push(t.email);
  }
  if (stmts.length) await env.DB.batch(stmts);
  const remaining = await env.DB.prepare("SELECT COUNT(*) AS c FROM profiles WHERE role != 'admin'").first();
  return json({ ok: true, deleted_users: perUser.length, deleted_emails: perUser, non_admin_users_remaining: remaining?.c ?? 0,
    message: 'Testing phase ended — all non-admin accounts and their data were wiped. Programme start is unchanged and still a separate action.' });
}
