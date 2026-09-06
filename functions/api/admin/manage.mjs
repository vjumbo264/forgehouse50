// POST /api/admin/manage — admin management actions. Admin only.
//   { action: 'assignment', day_number, book, chapter_start, chapter_end }  — add/update a day's assignment
//   { action: 'badge', user_id, badge_id, grant: true|false }               — grant or revoke a badge
// Private note content is never touched here.
import { json, badRequest, forbidden, readJson, uuid } from '../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../lib/auth.mjs';
import { estimateMinutes } from '../../lib/calendar.mjs';

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const body = await readJson(request);
  const action = String(body?.action || '');

  if (action === 'assignment') {
    const day = parseInt(body?.day_number ?? 0, 10);
    const book = String(body?.book || '').trim();
    const cs = parseInt(body?.chapter_start ?? 0, 10);
    const ce = parseInt(body?.chapter_end ?? 0, 10);
    if (!day || day < 1 || day > 50) return badRequest('day_number must be 1–50');
    if (!book || !cs || !ce || ce < cs) return badRequest('book, chapter_start, chapter_end are required');
    const chapterCount = ce - cs + 1;
    // Replace the day's assignments with the provided single range (manage = correct/adjust).
    await env.DB.prepare('DELETE FROM reading_assignments WHERE day_number = ?').bind(day).run();
    await env.DB.prepare(
      'INSERT INTO reading_assignments (id, day_number, book, chapter_start, chapter_end, chapter_count, est_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(uuid(), day, book, cs, ce, chapterCount, estimateMinutes(chapterCount)).run();
    return json({ ok: true, day_number: day, book, chapter_start: cs, chapter_end: ce, chapter_count: chapterCount });
  }

  if (action === 'badge') {
    const targetId = String(body?.user_id || '');
    const badgeId = String(body?.badge_id || '');
    const grant = !!body?.grant;
    if (!targetId || !badgeId) return badRequest('user_id and badge_id are required');
    const badge = await env.DB.prepare('SELECT id FROM badges WHERE id = ?').bind(badgeId).first();
    if (!badge) return badRequest('Unknown badge_id');
    if (grant) {
      await env.DB.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)').bind(targetId, badgeId).run();
    } else {
      await env.DB.prepare('DELETE FROM user_badges WHERE user_id = ? AND badge_id = ?').bind(targetId, badgeId).run();
    }
    return json({ ok: true, badge_id: badgeId, granted: grant });
  }

  return badRequest("action must be 'assignment' or 'badge'");
}
