-- ForgeHouse 50 — Cloudflare D1 (SQLite) schema
-- Replaces every table Supabase would have held.
-- NOTE: D1 has no row-level security. ALL access scoping is enforced in the
-- Worker query layer. See ARCHITECTURE.md for the per-table access rules.

PRAGMA foreign_keys = ON;

-- ─── Auth & users ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id              TEXT PRIMARY KEY,              -- uuid
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT NOT NULL,                 -- PBKDF2-SHA256 via Web Crypto
  name            TEXT NOT NULL DEFAULT '',
  surname         TEXT NOT NULL DEFAULT '',             -- combined_fixes_v1 Issue 1: required at registration
  avatar_url      TEXT,
  avatar_id       TEXT,                          -- preset avatar id (app.js AVATARS); NULL = initial fallback
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
  email_verified  INTEGER NOT NULL DEFAULT 0,    -- boolean 0/1
  programme_start_date TEXT,                     -- per_user_calendar_and_quiz_v1: this user's Day-1 anchor (ISO date),
                                                 -- set at OTP verification; existing users backfilled to 2026-09-07
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,                     -- 6 digits
  purpose     TEXT NOT NULL DEFAULT 'verify_email' CHECK (purpose IN ('verify_email','password_reset')),
  expires_at  TEXT NOT NULL,                     -- ISO-8601, 10 minutes from creation
  consumed_at TEXT,                              -- set when successfully used (one-time)
  attempts    INTEGER NOT NULL DEFAULT 0,        -- brute-force guard, max 5
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_otp_user_purpose ON otp_codes(user_id, purpose, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,                  -- session token (random 32 bytes, hex)
  user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,                     -- rolling 30-day session
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

-- ─── Programme calendar ─────────────────────────────────────────────────────

-- reading_days is the SHARED LEGACY reference calendar (start 2026-09-07).
-- As of per_user_calendar_and_quiz_v1 the REAL schedule is per-user (see
-- user_reading_days below); this table is kept as reference/provenance and
-- because reading_assignments / reading_progress still FK to day_number.
CREATE TABLE IF NOT EXISTS reading_days (
  day_number  INTEGER PRIMARY KEY CHECK (day_number BETWEEN 1 AND 50),
  date        TEXT NOT NULL UNIQUE,              -- ISO date; never a Tuesday or Friday
  label       TEXT NOT NULL DEFAULT ''
);

-- Per-user calendar (per_user_calendar_and_quiz_v1): (user, day_number) -> the
-- calendar date that reading day falls on for THAT user. Each user's Day 1 is
-- their own programme_start_date; Tuesdays & Fridays are skipped per-user.
-- Generated lazily by functions/lib/calendar.mjs (materialised on first
-- calendar read / at verification). Applied via migrations/per_user_calendar_v1.sql.
CREATE TABLE IF NOT EXISTS user_reading_days (
  user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_number  INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 50),
  date        TEXT NOT NULL,                     -- ISO date; never Tue/Fri for THIS user
  label       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, day_number)
);
CREATE INDEX IF NOT EXISTS idx_urd_user_date ON user_reading_days(user_id, date);

CREATE TABLE IF NOT EXISTS reading_assignments (
  id             TEXT PRIMARY KEY,
  day_number     INTEGER NOT NULL REFERENCES reading_days(day_number) ON DELETE CASCADE,
  book           TEXT NOT NULL,                  -- e.g. 'Matthew'
  chapter_start  INTEGER NOT NULL,
  chapter_end    INTEGER NOT NULL,
  chapter_count  INTEGER NOT NULL,
  est_minutes    INTEGER NOT NULL DEFAULT 20,    -- estimated reading time
  UNIQUE (day_number, book, chapter_start)
);
CREATE INDEX IF NOT EXISTS idx_assignments_day ON reading_assignments(day_number);

-- ─── Per-user reading state ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reading_progress (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_number     INTEGER NOT NULL REFERENCES reading_days(day_number) ON DELETE CASCADE,
  completed      INTEGER NOT NULL DEFAULT 0,
  completed_at   TEXT,
  reading_seconds INTEGER NOT NULL DEFAULT 0,    -- accumulated time on the reading page
  chapters_read  INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, day_number)
);
CREATE INDEX IF NOT EXISTS idx_progress_user ON reading_progress(user_id);

CREATE TABLE IF NOT EXISTS audio_progress (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_number     INTEGER NOT NULL REFERENCES reading_days(day_number) ON DELETE CASCADE,
  completed      INTEGER NOT NULL DEFAULT 0,     -- audio session finished (+5 pts, once)
  seconds_listened INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, day_number)
);

-- ─── Notes (PRIVATE — never cross-user, never admin-readable) ───────────────

CREATE TABLE IF NOT EXISTS notes (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note_type    TEXT NOT NULL CHECK (note_type IN ('observation','question','scripture_connection','application','prayer')),
  body         TEXT NOT NULL,
  book         TEXT NOT NULL,
  chapter      INTEGER NOT NULL,
  verse        INTEGER,                          -- nullable
  day_number   INTEGER REFERENCES reading_days(day_number) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_notes_user_type ON notes(user_id, note_type);
CREATE INDEX IF NOT EXISTS idx_notes_user_day ON notes(user_id, day_number);

-- ─── Reading page state ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bookmarks (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  book        TEXT NOT NULL,
  chapter     INTEGER NOT NULL,
  verse       INTEGER,
  day_number  INTEGER REFERENCES reading_days(day_number) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, book, chapter, verse)
);

CREATE TABLE IF NOT EXISTS highlights (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  book        TEXT NOT NULL,
  chapter     INTEGER NOT NULL,
  verse_start INTEGER NOT NULL,
  verse_end   INTEGER NOT NULL,
  color       TEXT NOT NULL DEFAULT 'amber' CHECK (color IN ('amber','green','blue','rose')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, book, chapter, verse_start, verse_end)
);
CREATE INDEX IF NOT EXISTS idx_highlights_user ON highlights(user_id);

-- ─── Points, badges, leaderboard ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS points (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action      TEXT NOT NULL CHECK (action IN (
                'reading_completed',        -- +10
                'audio_completed',          -- +5
                'daily_streak',             -- +3
                'observation_saved',        -- +2
                'question_saved',           -- +2
                'community_shared',         -- +3 (future; accepted but unused until community ships)
                'weekly_target_completed',  -- +10
                'programme_completed',      -- +100
                'admin_adjustment',         -- +/- n, requires reason
                'quiz_score'                -- +0..5 proportional (score/total)x5; quiz_redesign_and_launch_wipe_v1
              )),
  points      INTEGER NOT NULL,
  day_number  INTEGER,                          -- context for idempotency
  idempotency_key TEXT NOT NULL,                -- e.g. 'reading_completed:u123:day7'
  reason      TEXT,                             -- required for admin_adjustment
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, idempotency_key)             -- THE point-farming guard
);
CREATE INDEX IF NOT EXISTS idx_points_user ON points(user_id);

CREATE TABLE IF NOT EXISTS badges (
  id          TEXT PRIMARY KEY,                 -- slug, e.g. 'streak-7'
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  rule        TEXT NOT NULL                     -- machine-checkable rule key
);

CREATE TABLE IF NOT EXISTS user_badges (
  user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id    TEXT NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  awarded_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, badge_id)
);

-- Quiz attempts (quiz_redesign_and_launch_wipe_v1): at most ONE attempt per
-- user per reading day, EVER (enforced server-side at /api/quiz/submit AND by
-- the unique index below). The quiz is informational/scoring-only: it NEVER
-- gates day completion. `passed` is a repurposed informational flag (>= 67%
-- correct) with zero effect on completion status or point eligibility.
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_number  INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 50),
  score       INTEGER NOT NULL,                  -- questions correct
  total       INTEGER NOT NULL,                  -- questions asked
  passed      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_quiz_user_day ON quiz_attempts(user_id, day_number, created_at);
-- quiz_redesign_and_launch_wipe_v1: hard DB-level one-attempt guarantee
CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_one_attempt ON quiz_attempts(user_id, day_number);

CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  id           TEXT PRIMARY KEY,
  category     TEXT NOT NULL CHECK (category IN (
                 'overall','consistency','chapters','reading_time','observations','questions')),
  period       TEXT NOT NULL DEFAULT 'all_time',
  user_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  value        INTEGER NOT NULL,                -- aggregate score/count ONLY, never note content
  rank         INTEGER NOT NULL,
  computed_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_leaderboard_cat ON leaderboard_snapshots(category, period, rank);

-- ─── Programme-run launch & finale (programme_launch_and_finale_v1) ───────
-- programme_config: key/value store for the ONE global run lifecycle —
-- start_at, join_window_closes_at (exclusive), programme_end_date (computed
-- once at window close), final_snapshot_at (set when the permanent snapshot
-- is taken). final_rankings: the one-time permanent final leaderboard
-- (run_id = run start date). final_rank_acks: one-time top-3 celebration
-- banner acknowledgement per user per run.
CREATE TABLE IF NOT EXISTS programme_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS final_rankings (
  run_id       TEXT NOT NULL,
  rank         INTEGER NOT NULL,
  user_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_id    TEXT,
  total_points INTEGER NOT NULL,
  finished_at  TEXT,
  snapshot_at  TEXT NOT NULL,
  PRIMARY KEY (run_id, rank)
);
CREATE INDEX IF NOT EXISTS idx_final_rankings_user ON final_rankings(user_id);

CREATE TABLE IF NOT EXISTS final_rank_acks (
  user_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  run_id   TEXT NOT NULL,
  acked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, run_id)
);

-- ─── Seed: badge catalogue ──────────────────────────────────────────────────

INSERT OR IGNORE INTO badges (id, name, description, rule) VALUES
  ('streak-7',        '7-Day Streak',     'Read 7 reading days in a row',              'streak>=7'),
  ('streak-14',       '14-Day Streak',    'Read 14 reading days in a row',             'streak>=14'),
  ('streak-25',       '25-Day Streak',    'Read 25 reading days in a row',             'streak>=25'),
  ('finisher-50',     '50-Day Finisher',  'Complete all 50 reading days',              'days_completed>=50'),
  ('chapters-100',    '100 Chapters',     'Read 100 chapters of the New Testament',    'chapters>=100'),
  ('chapters-200',    '200 Chapters',     'Read 200 chapters of the New Testament',    'chapters>=200'),
  ('chapters-260',    '260 Chapters',     'Read the entire New Testament',             'chapters>=260'),
  ('audio-50',        '50 Audio Sessions','Complete 50 audio reading sessions',        'audio_sessions>=50'),
  ('observations-25', '25 Observations',  'Save 25 observation notes',                 'observations>=25'),
  ('questions-25',    '25 Questions',     'Save 25 question notes',                    'questions>=25');
