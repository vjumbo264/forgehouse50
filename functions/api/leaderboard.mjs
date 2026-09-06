// GET /api/leaderboard?category=overall|consistency|chapters|reading_time|observations|questions
// Aggregate counts/scores ONLY — never note content, never emails.
import { json, badRequest } from '../lib/http.mjs';
import { requireUser } from '../lib/auth.mjs';
import { leaderboard, streaks } from '../lib/points.mjs';

const CATEGORIES = ['overall', 'consistency', 'chapters', 'reading_time', 'observations', 'questions'];

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const category = new URL(request.url).searchParams.get('category') || 'overall';
  if (!CATEGORIES.includes(category)) return badRequest(`category must be one of: ${CATEGORIES.join(', ')}`);

  const rows = await leaderboard(env.DB, category, 50);

  // For consistency, attach current streak per listed user (aggregate, no private content).
  if (category === 'consistency') {
    for (const r of rows) {
      const s = await streaks(env.DB, r.user_id);
      r.streak_current = s.current;
      r.streak_longest = s.longest;
    }
    rows.sort((a, b) => (b.streak_current - a.streak_current) || (b.value - a.value));
    rows.forEach((r, i) => { r.rank = i + 1; });
  }

  return json({ category, entries: rows });
}
