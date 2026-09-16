// GET /api/leaderboard?category=overall|consistency|chapters|reading_time|observations|questions
// Aggregate counts/scores ONLY — never note content, never emails.
//
// leaderboard_scripture_icon_fix_v1 / ISSUE 1 (2026-09-15):
//   - "overall" ranks by RAW CUMULATIVE TOTAL POINTS (sum of every point
//     source: reading completion, audio, quiz proportional score, streaks,
//     observations, questions, sharing, weekly targets, programme
//     completion). NO per-day average, NO damping — per the operator's
//     explicit, repeated instruction. This supersedes the earlier
//     task-q08 damped-average Overall Score, which the operator has
//     confirmed was a regression against the intended scope (the damping
//     formula was only ever meant as a narrow fairness aid for mid-programme
//     averaged comparison, never the primary Overall Score shown to users;
//     it has now been removed from the leaderboard entirely).
//   - ELIGIBILITY: leaderboards are IMMEDIATE (combined_fixes_v1 Issue 11) —
//     every verified participant ranks from day 0/1; no day-3 gate.
//   - consistency / chapters / reading_time / observations / questions are
//     UNCHANGED plain cumulative rankings.
//   - The one-time final end-of-programme snapshot (lib/programme.mjs
//     takeFinalSnapshot) already used raw totals and is untouched.
import { json, badRequest } from '../lib/http.mjs';
import { requireUser } from '../lib/auth.mjs';
import { streaks, LEADERBOARD_MIN_ELAPSED_DAYS } from '../lib/points.mjs';
import { utcToday } from '../lib/calendar.mjs';

const CATEGORIES = ['overall', 'consistency', 'chapters', 'reading_time', 'observations', 'questions'];

// One query returns, per verified user: their aggregate value for the
// requested category plus the inputs Overall Score needs (points + the
// user's current reading-day number on their own calendar).
const AGG_SQL = `
  SELECT
    pr.id AS user_id,
    pr.name AS display_name,
    pr.surname AS surname,
    pr.avatar_url,
    pr.avatar_id,
    pr.created_at,
    COALESCE((SELECT SUM(points) FROM points p WHERE p.user_id = pr.id), 0) AS total_points,
    COALESCE((SELECT MAX(urd.day_number) FROM user_reading_days urd WHERE urd.user_id = pr.id AND urd.date <= ?), 0) AS elapsed_days,
    COALESCE((SELECT COUNT(*) FROM reading_progress rp WHERE rp.user_id = pr.id AND rp.completed = 1), 0) AS days_completed,
    COALESCE((SELECT SUM(rp2.chapters_read) FROM reading_progress rp2 WHERE rp2.user_id = pr.id AND rp2.completed = 1), 0) AS chapters,
    COALESCE((SELECT SUM(rp3.reading_seconds) FROM reading_progress rp3 WHERE rp3.user_id = pr.id), 0) AS reading_time,
    COALESCE((SELECT COUNT(*) FROM notes n WHERE n.user_id = pr.id AND n.note_type = 'observation'), 0) AS observations,
    COALESCE((SELECT COUNT(*) FROM notes n2 WHERE n2.user_id = pr.id AND n2.note_type = 'question'), 0) AS questions
  FROM profiles pr
  WHERE pr.email_verified = 1 AND pr.role != 'admin'`;

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const category = new URL(request.url).searchParams.get('category') || 'overall';
  if (!CATEGORIES.includes(category)) return badRequest(`category must be one of: ${CATEGORIES.join(', ')}`);

  const today = utcToday();
  const { results: all } = await env.DB.prepare(AGG_SQL).bind(today).all();
  const rows = all || [];

  // Eligibility: immediate (LEADERBOARD_MIN_ELAPSED_DAYS = 0) — every
  // verified participant appears from day 0/1 on their own calendar.
  const eligible = rows.filter(r => (r.elapsed_days ?? 0) >= LEADERBOARD_MIN_ELAPSED_DAYS);

  let entries;
  if (category === 'overall') {
    // Raw cumulative total points — the primary, default Overall Score.
    entries = eligible
      .map(r => ({ ...r, value: r.total_points }))
      .sort((a, b) => (b.value - a.value) || (a.created_at < b.created_at ? -1 : 1));
  } else if (category === 'consistency') {
    // leaderboard_audio_removal_offline_bible_v1 / ISSUE 1: the DISPLAYED +
    // RANKED value for Consistency is the user's current STREAK, not their
    // points total (and not the days_completed count this used to carry).
    entries = eligible.map(r => ({ ...r, value: r.days_completed }));
    for (const e of entries) {
      const s = await streaks(env.DB, e.user_id);
      e.streak_current = s.current;
      e.streak_longest = s.longest;
      e.value = s.current; // the category's own metric, not a points figure
    }
    entries.sort((a, b) => (b.value - a.value) || (b.streak_longest - a.streak_longest));
  } else {
    // Plain cumulative ranking, unchanged semantics.
    const col = { chapters: 'chapters', reading_time: 'reading_time', observations: 'observations', questions: 'questions' }[category];
    entries = eligible
      .map(r => ({ ...r, value: r[col] }))
      .sort((a, b) => (b.value - a.value) || (a.created_at < b.created_at ? -1 : 1));
  }

  const out = entries.slice(0, 50).map((r, i) => ({
    rank: i + 1,
    user_id: r.user_id,
    display_name: `${r.display_name || 'Member'}${r.surname ? ' ' + r.surname.trim()[0].toUpperCase() + '.' : ''}`, // Issue 1: tight rows show 'Given S.'
    avatar_url: r.avatar_url,
    avatar_id: r.avatar_id ?? null,
    value: r.value,
    ...(category === 'consistency' ? { streak_current: r.streak_current, streak_longest: r.streak_longest } : {}),
    ...(category === 'overall' ? { elapsed_days: r.elapsed_days, total_points: r.total_points } : {}),
  }));

  return json({
    category,
    entries: out,
    eligible_count: eligible.length,
    gate: { min_elapsed_days: LEADERBOARD_MIN_ELAPSED_DAYS },
    scoring: category === 'overall' ? { formula: 'raw cumulative total points (sum of all point sources)', k: null } : undefined,
  });
}
