-- per_user_calendar_and_quiz_v1 / task-q02 — schema migration (idempotent).
--
-- Meaning change: "reading day" becomes PER-USER. Each user's Day 1 is the
-- calendar date their account became active (OTP verification), and their
-- own 50 reading days proceed from there, still skipping Tuesdays/Fridays
-- for that individual user.
--
--   1. profiles.programme_start_date        — per-user Day-1 anchor.
--      Existing verified users backfilled to the ORIGINAL shared start
--      (2026-09-07) so historical reading_progress day_number attribution
--      is preserved 1:1 (no renumbering, nothing lost).
--   2. user_reading_days                    — per-user calendar:
--      (user_id, day_number) -> the calendar date that day falls on for
--      THAT user. Backfilled for existing verified users from 2026-09-07.
--      reading_days stays as the shared LEGACY reference calendar.
--   3. quiz_attempts                        — every quiz attempt recorded
--      (score, total, passed, timestamp). A reading day only completes via
--      a PASSING attempt (the single completion gate).
--
-- reading_assignments stays SHARED (Day N's book/chapters are universal).

-- ─── 1. profiles.programme_start_date ───────────────────────────────────────
ALTER TABLE profiles ADD COLUMN programme_start_date TEXT;   -- ISO date; NULL until verified/migrated

-- Backfill: everyone who already has an account keeps the original shared
-- start date so their existing progress maps to the same day numbers.
UPDATE profiles SET programme_start_date = '2026-09-07'
  WHERE programme_start_date IS NULL AND email_verified = 1;

-- ─── 2. per-user calendar ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_reading_days (
  user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_number  INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 50),
  date        TEXT NOT NULL,                    -- ISO date; never Tue/Fri for THIS user
  label       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, day_number)
);
CREATE INDEX IF NOT EXISTS idx_urd_user_date ON user_reading_days(user_id, date);

-- Backfill per-user rows for verified users from the ORIGINAL shared
-- calendar (dates match reading_days exactly for the 2026-09-07 cohort).
-- Dates for later-starting users are generated in code (calendar.mjs) and
-- materialised on account activation / first fetch.
INSERT OR IGNORE INTO user_reading_days (user_id, day_number, date, label)
  SELECT pr.id, rd.day_number, rd.date, rd.label
  FROM profiles pr CROSS JOIN reading_days rd
  WHERE pr.email_verified = 1
    AND pr.programme_start_date = '2026-09-07';

-- ─── 3. quiz attempts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_number  INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 50),
  score       INTEGER NOT NULL,                 -- questions correct
  total       INTEGER NOT NULL,                 -- questions asked
  passed      INTEGER NOT NULL DEFAULT 0,       -- 1 when score >= ceil(2/3 * total)
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_quiz_user_day ON quiz_attempts(user_id, day_number, created_at);
