// programme_launch_and_finale_v1 — GLOBAL programme-run launch control.
//
// One programme run has exactly one global lifecycle, anchored by the admin's
// "Start Programme" press (functions/api/admin/programme.mjs):
//
//   1. start_at               — the one global timestamp the run began.
//   2. join_window_closes_at  — ISO date, EXCLUSIVE. Registration is open for
//                               exactly JOIN_WINDOW_DAYS calendar days from the
//                               start date (start day .. start+9 inclusive);
//                               closed once today >= this date.
//   3. programme_end_date     — computed ONCE, the first time any request
//                               observes today >= join_window_closes_at, and
//                               stored. Deterministic at that moment because
//                               every eligible participant's own day-50 date
//                               is then knowable (verify.mjs clamps any
//                               post-close verification's Day-1 anchor to the
//                               last join day, so NO participant's schedule
//                               can end later than day50Date(lastJoinDay)).
//   4. final_snapshot_at      — set when the one-time final ranking snapshot
//                               is taken (the first request observed on/after
//                               programme_end_date). Never recomputed.
//
// All state lives in the programme_config key/value table. Rankings live in
// final_rankings (permanent, immutable once written).

import { generateReadingDayDates, utcToday, TOTAL_DAYS } from './calendar.mjs';

export const JOIN_WINDOW_DAYS = 10;

export const REGISTRATION_CLOSED_MESSAGE =
  'Registration for this ForgeHouse 50 run has closed — the programme is already underway';

export function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function getProgrammeConfig(db) {
  const { results } = await db.prepare('SELECT key, value FROM programme_config').all();
  const map = {};
  for (const r of results || []) map[r.key] = r.value;
  return {
    started: !!map.start_at,
    start_at: map.start_at || null,
    join_window_closes_at: map.join_window_closes_at || null, // ISO date, EXCLUSIVE
    programme_end_date: map.programme_end_date || null,
    final_snapshot_at: map.final_snapshot_at || null,
  };
}

export async function setConfig(db, key, value) {
  await db.prepare(
    `INSERT INTO programme_config (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(key, value, new Date().toISOString()).run();
}

// Registration is open before the admin ever presses Start (documented
// pre-launch default: the operator/early testers can still register; the
// 10-day clock only starts at the button press), and for exactly
// JOIN_WINDOW_DAYS calendar days afterwards.
export function registrationOpen(cfg, today = utcToday()) {
  if (!cfg.started) return true;
  return today < cfg.join_window_closes_at;
}

// The calendar date of reading day 50 for a personal schedule whose Day 1 is
// startDate (Tue/Fri skipped — the real, non-naive end of a 50-day run).
export function day50Date(startDate) {
  return generateReadingDayDates(startDate, TOTAL_DAYS)[TOTAL_DAYS - 1].date;
}

// The true end condition (Part B): the run is fully over at
//   max(every eligible user's own calculated day-50 date)
// where eligible = every verified non-admin profile (registration is closed
// by the time this runs, so the participant set is fixed). Users whose
// per-user calendar is already materialised contribute their stored day-50
// date; everyone else contributes the date generated from their own
// programme_start_date. The floor — day50Date(last join day) — covers any
// in-window registrant who never engaged (their schedule is clamped to the
// last join day by verify.mjs), so the result is exact, not a ~60-day guess.
export async function computeProgrammeEndDate(db, cfg) {
  const lastJoinDay = addDays(cfg.join_window_closes_at, -1);
  let end = day50Date(lastJoinDay); // floor: latest possible joiner's day 50
  const { results: users } = await db.prepare(
    "SELECT id, programme_start_date FROM profiles WHERE email_verified = 1 AND role != 'admin'"
  ).all();
  const { results: d50rows } = await db.prepare(
    'SELECT user_id, date FROM user_reading_days WHERE day_number = 50'
  ).all();
  const known = new Map((d50rows || []).map(r => [r.user_id, r.date]));
  for (const u of users || []) {
    const d = known.get(u.id) || (u.programme_start_date ? day50Date(u.programme_start_date) : null);
    if (d && d > end) end = d;
  }
  return end;
}

// Take the ONE final, permanent snapshot (Part C). Only users who ACTUALLY
// completed reading day 50 are ranked, by RAW total accumulated points.
// (Note: as of leaderboard_scripture_icon_fix_v1 / ISSUE 1 the in-progress
// leaderboard ALSO uses raw total points — the former damped adjusted_score
// was removed entirely — so final and in-progress scoring now agree.)
// Ties are broken
// by who reached day 50 EARLIEST (reading_progress.completed_at of day 50),
// then display_name for full determinism. Guarded by final_snapshot_at +
// run_id: computed exactly once, never recalculated or altered afterward.
export async function takeFinalSnapshot(db, cfg) {
  const runId = cfg.start_at.slice(0, 10);
  const { results: finishers } = await db.prepare(
    `SELECT pr.id AS user_id, (pr.name || CASE WHEN pr.surname != '' THEN ' ' || pr.surname ELSE '' END) AS display_name, pr.avatar_id,
            COALESCE((SELECT SUM(p.points) FROM points p WHERE p.user_id = pr.id), 0) AS total_points,
            (SELECT rp.completed_at FROM reading_progress rp
              WHERE rp.user_id = pr.id AND rp.day_number = 50 AND rp.completed = 1) AS finished_at
     FROM profiles pr
     WHERE pr.email_verified = 1 AND pr.role != 'admin'
       AND EXISTS (SELECT 1 FROM reading_progress rp2
                    WHERE rp2.user_id = pr.id AND rp2.day_number = 50 AND rp2.completed = 1)`
  ).all();

  const ranked = (finishers || []).sort((a, b) =>
    (b.total_points - a.total_points) ||
    ((a.finished_at || '9999') < (b.finished_at || '9999') ? -1
      : (a.finished_at || '9999') > (b.finished_at || '9999') ? 1 : 0) ||
    String(a.display_name || '').localeCompare(String(b.display_name || ''))
  );

  const now = new Date().toISOString();
  const stmts = ranked.map((f, i) => db.prepare(
    `INSERT INTO final_rankings (run_id, rank, user_id, display_name, avatar_id, total_points, finished_at, snapshot_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(runId, i + 1, f.user_id, f.display_name || 'Member', f.avatar_id ?? null, f.total_points, f.finished_at, now));
  stmts.push(db.prepare(
    `INSERT INTO programme_config (key, value, updated_at) VALUES ('final_snapshot_at', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(now, now));
  await db.batch(stmts);
  return { ...cfg, final_snapshot_at: now };
}

// Advance the global lifecycle as far as the real calendar allows. Called
// from the public programme endpoint, /api/auth/me (every page load), and
// /api/final_results — so the end date is computed the first time anything
// runs after the join window closes, and the snapshot is taken the first
// time anything runs on/after the end date. No polling, no cron.
export async function refreshProgrammeState(db) {
  let cfg = await getProgrammeConfig(db);
  const today = utcToday();
  if (cfg.started && !cfg.programme_end_date && today >= cfg.join_window_closes_at) {
    const end = await computeProgrammeEndDate(db, cfg);
    await setConfig(db, 'programme_end_date', end);
    cfg.programme_end_date = end;
  }
  if (cfg.programme_end_date && !cfg.final_snapshot_at && today >= cfg.programme_end_date) {
    cfg = await takeFinalSnapshot(db, cfg);
  }
  return cfg;
}
