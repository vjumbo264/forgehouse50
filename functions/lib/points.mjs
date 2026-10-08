import { ensureUserCalendar, elapsedDays, watToday, watDateOf } from './calendar.mjs';

// Points & badges engine. Idempotency is enforced by the
// UNIQUE(user_id, idempotency_key) constraint in the points table:
// duplicate submissions are silently absorbed, so retries/double-taps
// cannot farm points.

// combined_fixes_v1 / Issue 11: EVERY point allocation multiplied by 7
// (operator: "multiply the points by 7 so that it will be more encouraging").
export const POINT_VALUES = {
  reading_completed: 70,
  audio_completed: 35,
  daily_streak: 21,
  observation_saved: 14,
  question_saved: 14,
  community_shared: 21,
  weekly_target_completed: 70,
  programme_completed: 700,
  quiz_score: 35, // MAX quiz pts per day (Q); awarded proportionally as round((score/total) * 35) via the explicit `points` override in /api/quiz/submit
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
// A streak counts consecutive COMPLETED reading days in day_number order.
// Server-authoritative rules (streak_reader_support_fix_v1):
// 1. Current streak reflects genuinely active consecutive reading.
// 2. A user's schedule is defined in user_reading_days in West Africa Time (WAT).
// 3. Inactivity reset: If a user has a lapse where a calendar reading day passes
//    without completing reading, the current streak resets to 0.
//    Specifically, the streak is alive iff:
//    - The user completed the reading scheduled for today or beyond (highestCompleted >= elapsedDays), OR
//    - The user was active (completed reading) today or on the most recent scheduled reading day
//      (watCompletedDate >= today || watCompletedDate >= prevReadingDate), which keeps
//      the streak alive for users reading today, users on non-reading days (Tue/Fri),
//      and users actively working through catch-up backlog.
// 4. If inactive (neither caught up nor active within the current/previous reading day),
//    current streak resets to 0 immediately.
// 5. Longest streak records the user's all-time maximum consecutive run and is preserved.
export async function streaks(db, userId) {
  const { results: progressRows } = await db.prepare(
    'SELECT day_number, completed_at, updated_at FROM reading_progress WHERE user_id = ? AND completed = 1 ORDER BY day_number'
  ).bind(userId).all();
  const days = (progressRows || []).map(r => r.day_number);

  let longest = 0, currentRun = 0, prev = 0;
  for (const d of days) {
    currentRun = (d === prev + 1) ? currentRun + 1 : 1;
    if (currentRun > longest) longest = currentRun;
    prev = d;
  }

  // "current streak" = run ending at the highest completed day
  if (days.length === 0) {
    return { current: 0, longest: 0 };
  }

  // Evaluate activity status against the user's WAT calendar schedule
  const today = watToday();
  const { rows: calendarRows } = await ensureUserCalendar(db, userId);
  const elapsed = elapsedDays(calendarRows, today);
  const highestCompleted = days[days.length - 1];

  // ISSUE 4: Catch-up / backlog days (highestCompleted < elapsed) must NEVER increase streak.
  // Streak specifically measures consecutive genuine activity on actual current calendar days.
  // If the user has not completed up to today's scheduled reading day, they are in
  // catch-up backlog recovery mode and current streak is 0.
  if (highestCompleted < elapsed) {
    return { current: 0, longest };
  }

  // When caught up or on schedule (highestCompleted >= elapsed):
  // Current streak counts consecutive on-time completed days ending at highestCompleted.
  // A day was completed on-time if its completion WAT date <= its scheduled date
  // (or if completed on today's date for current/read-ahead days).
  const userDayMap = new Map((calendarRows || []).map(r => [r.day_number, r.date]));
  let cur = 0;
  for (let i = progressRows.length - 1; i >= 0; i--) {
    const r = progressRows[i];
    if (i < progressRows.length - 1 && r.day_number !== progressRows[i + 1].day_number - 1) {
      break;
    }
    const sched = userDayMap.get(r.day_number);
    const compDate = watDateOf(r.completed_at || r.updated_at);
    const isOnTime = compDate && (compDate <= sched || (r.day_number <= elapsed && compDate <= today));
    if (isOnTime) {
      cur++;
    } else {
      break; // Broken by a backlog/catch-up recovery day
    }
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
    `SELECT pr.id AS user_id, pr.name AS display_name, pr.surname AS surname, pr.avatar_url, pr.avatar_id, ${expr} AS value
     FROM profiles pr WHERE pr.email_verified = 1
     ORDER BY value DESC, pr.created_at ASC LIMIT ?`
  ).bind(limit).all();
  return (results || []).map((r, i) => ({ rank: i + 1, user_id: r.user_id, display_name: r.display_name || 'Member', surname: r.surname || '', avatar_url: r.avatar_url, avatar_id: r.avatar_id ?? null, value: r.value }));
}

// ── Eligibility: leaderboards are IMMEDIATE (combined_fixes_v1 Issue 11) ──
// Every verified participant ranks from day 0/1; no minimum-elapsed-days gate.
export const LEADERBOARD_MIN_ELAPSED_DAYS = 0;

// leaderboard_scripture_icon_fix_v1 / ISSUE 1 (2026-09-15): the damped
// per-day-average Overall Score (adjusted_score = (raw_avg*elapsed)/(elapsed+K),
// K=7, formerly task-q08) has been REMOVED as the primary Overall Score and is
// no longer used anywhere. The operator confirmed the primary leaderboard must
// be RAW CUMULATIVE TOTAL POINTS. The damping formula was only ever intended
// as a narrow fairness aid for mid-programme averaged comparison, never the
// default ranking number shown to users; keeping a second similar-looking
// number added more confusion than value, so it was removed rather than kept
// as a secondary view. dampedScore is intentionally deleted so no code path
// can re-introduce it as the Overall Score.
