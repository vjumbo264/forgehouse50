// Points & badges engine. Idempotency is enforced by the
// UNIQUE(user_id, idempotency_key) constraint in the points table:
// duplicate submissions are silently absorbed, so retries/double-taps
// cannot farm points.

export const POINT_VALUES = {
  reading_completed: 10,
  audio_completed: 5,
  daily_streak: 3,
  observation_saved: 2,
  question_saved: 2,
  community_shared: 3,
  weekly_target_completed: 10,
  programme_completed: 100,
};

// Award points exactly once per idempotency key.
// Returns { awarded: boolean, points: number }.
export async function awardPoints(db, userId, action, idempotencyKey, { dayNumber = null, points = null, reason = null } = {}) {
  const value = points ?? POINT_VALUES[action];
  if (value == null) throw new Error(`Unknown point action: ${action}`);
  const id = crypto.randomUUID();
  const result = await db.prepare(
    `INSERT OR IGNORE INTO points (id, user_id, action, points, day_number, idempotency_key, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, userId, action, value, dayNumber, idempotencyKey, reason).run();
  const awarded = (result.meta?.changes ?? 0) > 0;
  if (awarded) await checkBadges(db, userId);
  return { awarded, points: awarded ? value : 0 };
}

export async function totalPoints(db, userId) {
  const row = await db.prepare('SELECT COALESCE(SUM(points),0) AS total FROM points WHERE user_id = ?').bind(userId).first();
  return row?.total ?? 0;
}

// ── Streaks ────────────────────────────────────────────────────────────────
// A streak counts consecutive COMPLETED reading days in day_number order
// (calendar gaps like Tue/Fri do not break streaks — they are not reading days).
export async function streaks(db, userId) {
  const { results } = await db.prepare(
    'SELECT day_number FROM reading_progress WHERE user_id = ? AND completed = 1 ORDER BY day_number'
  ).bind(userId).all();
  const days = (results || []).map(r => r.day_number);
  let longest = 0, current = 0, prev = 0;
  for (const d of days) {
    current = (d === prev + 1) ? current + 1 : 1;
    if (current > longest) longest = current;
    prev = d;
  }
  // "current streak" = run ending at the highest completed day
  let cur = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (i === days.length - 1 || days[i] === days[i + 1] - 1) cur++;
    else break;
  }
  return { current: cur, longest };
}

// ── Aggregates used by stats / leaderboard / badges ────────────────────────
export async function userAggregates(db, userId) {
  const [progress, notes, audio, points] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS days_completed, COALESCE(SUM(chapters_read),0) AS chapters,
                       COALESCE(SUM(reading_seconds),0) AS reading_seconds
                FROM reading_progress WHERE user_id = ? AND completed = 1`).bind(userId).first(),
    db.prepare(`SELECT COUNT(*) AS total,
                       SUM(CASE WHEN note_type='observation' THEN 1 ELSE 0 END) AS observations,
                       SUM(CASE WHEN note_type='question' THEN 1 ELSE 0 END) AS questions
                FROM notes WHERE user_id = ?`).bind(userId).first(),
    db.prepare('SELECT COUNT(*) AS audio_sessions FROM audio_progress WHERE user_id = ? AND completed = 1').bind(userId).first(),
    totalPoints(db, userId),
  ]);
  const { current, longest } = await streaks(db, userId);
  return {
    days_completed: progress?.days_completed ?? 0,
    chapters: progress?.chapters ?? 0,
    reading_seconds: progress?.reading_seconds ?? 0,
    notes_total: notes?.total ?? 0,
    observations: notes?.observations ?? 0,
    questions: notes?.questions ?? 0,
    audio_sessions: audio?.audio_sessions ?? 0,
    streak_current: current,
    streak_longest: longest,
    points,
  };
}

// ── Badge rules ────────────────────────────────────────────────────────────
// Rule keys mirror the badges.rule column (see schema.sql seed).
export async function checkBadges(db, userId) {
  const agg = await userAggregates(db, userId);
  const rules = {
    'streak-7': agg.streak_longest >= 7,
    'streak-14': agg.streak_longest >= 14,
    'streak-25': agg.streak_longest >= 25,
    'finisher-50': agg.days_completed >= 50,
    'chapters-100': agg.chapters >= 100,
    'chapters-200': agg.chapters >= 200,
    'chapters-260': agg.chapters >= 260,
    'audio-50': agg.audio_sessions >= 50,
    'observations-25': agg.observations >= 25,
    'questions-25': agg.questions >= 25,
  };
  const newly = [];
  for (const [badgeId, met] of Object.entries(rules)) {
    if (!met) continue;
    const r = await db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)').bind(userId, badgeId).run();
    if ((r.meta?.changes ?? 0) > 0) newly.push(badgeId);
  }
  return newly;
}

export async function userBadges(db, userId) {
  const { results } = await db.prepare(
    `SELECT b.id, b.name, b.description, ub.awarded_at
     FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
     WHERE ub.user_id = ? ORDER BY ub.awarded_at`
  ).bind(userId).all();
  return results || [];
}

// ── Leaderboard (aggregate-only; never note content, never emails) ─────────
export async function leaderboard(db, category, limit = 50) {
  const cols = {
    overall: 'COALESCE((SELECT SUM(points) FROM points p WHERE p.user_id = pr.id),0)',
    consistency: `COALESCE((SELECT COUNT(*) FROM reading_progress rp WHERE rp.user_id = pr.id AND rp.completed = 1),0)`, // days completed; streaks shown alongside
    chapters: 'COALESCE((SELECT SUM(chapters_read) FROM reading_progress rp WHERE rp.user_id = pr.id AND rp.completed = 1),0)',
    reading_time: 'COALESCE((SELECT SUM(reading_seconds) FROM reading_progress rp WHERE rp.user_id = pr.id),0)',
    observations: `COALESCE((SELECT COUNT(*) FROM notes n WHERE n.user_id = pr.id AND n.note_type = 'observation'),0)`,
    questions: `COALESCE((SELECT COUNT(*) FROM notes n WHERE n.user_id = pr.id AND n.note_type = 'question'),0)`,
  };
  const expr = cols[category];
  if (!expr) return null;
  const { results } = await db.prepare(
    `SELECT pr.id AS user_id, pr.name AS display_name, pr.avatar_url, ${expr} AS value
     FROM profiles pr WHERE pr.email_verified = 1
     ORDER BY value DESC, pr.created_at ASC LIMIT ?`
  ).bind(limit).all();
  return (results || []).map((r, i) => ({ rank: i + 1, user_id: r.user_id, display_name: r.display_name || 'Member', avatar_url: r.avatar_url, value: r.value }));
}
