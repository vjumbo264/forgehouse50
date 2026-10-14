// programme_launch_and_finale_v1 + ops_batch_oct14_v1 — GLOBAL programme-run launch control.
//
// One programme run has exactly one global lifecycle, anchored by the admin's
// "Start Programme" press (functions/api/admin/programme.mjs):
//
//   1. start_at               — the one global timestamp the run began.
//   2. join_window_closes_at  — ISO date, EXCLUSIVE in WAT (e.g. '2026-10-22').
//                               Registration is open for exactly JOIN_WINDOW_DAYS
//                               calendar days in WAT counted from the start date,
//                               with the start day as Day 1.
//                               Started Mon 2026-10-12, it covers Mon 12 to
//                               Wed 2026-10-21 inclusive, closing at 23:59:59 WAT on 2026-10-21.
//   3. programme_end_date     — computed ONCE, the first time any request
//                               observes today >= join_window_closes_at, and stored.
//                               Deterministic at that moment: floor is
//                               day50Date(lastJoinDay) (for 2026-10-21, Day 50 is 2026-12-28).
//   4. final_snapshot_at      — set when the one-time final ranking snapshot is taken
//                               (the first request on/after programme_end_date).

import { generateReadingDayDates, utcToday, watDateOf, TOTAL_DAYS } from './calendar.mjs';

export const JOIN_WINDOW_DAYS = 10;
export const REGISTRATION_CLOSED_MESSAGE = 'Joining has closed';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatDateLong(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00Z');
  const dayName = DAYS_SHORT[d.getUTCDay()];
  const day = d.getUTCDate();
  const month = MONTHS_SHORT[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${dayName} ${day} ${month} ${year}`;
}

export function formatDateMedium(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00Z');
  const day = d.getUTCDate();
  const month = MONTHS_SHORT[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

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
    join_window_closes_at: map.join_window_closes_at || null, // ISO date, EXCLUSIVE in WAT
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

// Registration is open before the admin ever presses Start (pre-launch default),
// and for exactly JOIN_WINDOW_DAYS calendar days in WAT afterwards.
// Accepts an optional injectable clock / timestamp / ISO date for testing.
export function registrationOpen(cfg, nowOrDate = Date.now()) {
  if (!cfg.started) return true;
  if (!cfg.join_window_closes_at) return true;
  let dateStr;
  if (typeof nowOrDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(nowOrDate)) {
    dateStr = nowOrDate;
  } else {
    dateStr = watDateOf(nowOrDate);
  }
  return dateStr < cfg.join_window_closes_at;
}

export function getJoinWindowDetails(cfg, nowOrDate = Date.now()) {
  if (!cfg.started) {
    return {
      started: false,
      start_at: null,
      start_date: null,
      start_formatted: null,
      join_window_days: JOIN_WINDOW_DAYS,
      join_window_closes_at: null,
      join_window_last_day: null,
      join_window_last_day_formatted: null,
      join_window_closes_label: null,
      days_remaining: JOIN_WINDOW_DAYS,
      registration_open: true,
      status_summary: 'Programme not yet started',
      signup_label: 'Join ForgeHouse 50',
    };
  }

  const startWatDate = watDateOf(cfg.start_at);
  const exclusiveClose = cfg.join_window_closes_at || addDays(startWatDate, JOIN_WINDOW_DAYS);
  const lastJoinDay = addDays(exclusiveClose, -1);

  let currentWatDate;
  if (typeof nowOrDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(nowOrDate)) {
    currentWatDate = nowOrDate;
  } else {
    currentWatDate = watDateOf(nowOrDate);
  }

  const isOpen = currentWatDate < exclusiveClose;

  let daysRemaining = 0;
  if (currentWatDate < startWatDate) {
    daysRemaining = JOIN_WINDOW_DAYS;
  } else if (isOpen) {
    const diffMs = new Date(lastJoinDay + 'T00:00:00Z') - new Date(currentWatDate + 'T00:00:00Z');
    daysRemaining = Math.floor(diffMs / 86400000) + 1;
  } else {
    daysRemaining = 0;
  }

  const startFmt = formatDateLong(startWatDate);
  const lastDayFmt = formatDateLong(lastJoinDay);
  const signupCloseFmt = formatDateMedium(lastJoinDay);

  let statusSummary;
  let signupLabel;

  if (isOpen) {
    const dayWord = daysRemaining === 1 ? '1 day left' : `${daysRemaining} days left`;
    statusSummary = `Started ${startFmt} · Joining closes ${lastDayFmt} · ${dayWord}`;
    signupLabel = `Joining closes on ${signupCloseFmt}`;
  } else {
    statusSummary = `Started ${startFmt} · Joining closed ${lastDayFmt}`;
    signupLabel = 'Joining has closed';
  }

  return {
    started: true,
    start_at: cfg.start_at,
    start_date: startWatDate,
    start_formatted: startFmt,
    join_window_days: JOIN_WINDOW_DAYS,
    join_window_closes_at: exclusiveClose,
    join_window_last_day: lastJoinDay,
    join_window_last_day_formatted: lastDayFmt,
    join_window_closes_label: signupCloseFmt,
    days_remaining: daysRemaining,
    registration_open: isOpen,
    status_summary: statusSummary,
    signup_label: signupLabel,
  };
}

// The calendar date of reading day 50 for a personal schedule whose Day 1 is
// startDate (Tue/Fri skipped — the real, non-naive end of a 50-day run).
export function day50Date(startDate) {
  return generateReadingDayDates(startDate, TOTAL_DAYS)[TOTAL_DAYS - 1].date;
}

// The true end condition: the run is fully over when the latest possible joiner
// finishes reading day 50. Floor is day50Date(lastJoinDay).
export async function computeProgrammeEndDate(db, cfg) {
  const startWatDate = watDateOf(cfg.start_at);
  const exclusiveClose = cfg.join_window_closes_at || addDays(startWatDate, JOIN_WINDOW_DAYS);
  const lastJoinDay = addDays(exclusiveClose, -1);
  let end = day50Date(lastJoinDay);

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
