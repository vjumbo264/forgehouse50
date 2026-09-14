-- migrations/quiz_redesign_v1.sql
-- quiz_redesign_and_launch_wipe_v1 / task-w02 + task-w03
--
-- 1) quiz_attempts: at most ONE attempt per user per reading day, enforced at
--    the DB level as well as in /api/quiz/submit (which returns 409
--    attempt_used before ever reaching an INSERT). Existing live data was
--    verified to contain zero (user_id, day_number) duplicates before this
--    index was created.
CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_one_attempt ON quiz_attempts(user_id, day_number);

-- 2) points: add the 'quiz_score' action so proportional quiz points
--    (round((score/total) * 5)) can be recorded. SQLite cannot ALTER a CHECK
--    constraint, so the table is rebuilt; every existing row is preserved
--    verbatim. On the live D1 database this was applied via an equivalent
--    rename-first sequence (points -> points_pre_quiz_redesign -> recreate ->
--    copy -> drop) with identical before/after row counts (18) and SUM(points)
--    (117). The deploy workflow re-applies schema.sql idempotently, whose
--    points definition now includes 'quiz_score'.
CREATE TABLE IF NOT EXISTS points_quiz_redesign (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action      TEXT NOT NULL CHECK (action IN (
                'reading_completed',
                'audio_completed',
                'daily_streak',
                'observation_saved',
                'question_saved',
                'community_shared',
                'weekly_target_completed',
                'programme_completed',
                'admin_adjustment',
                'quiz_score'
              )),
  points      INTEGER NOT NULL,
  day_number  INTEGER,
  idempotency_key TEXT NOT NULL,
  reason      TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, idempotency_key)
);
INSERT OR IGNORE INTO points_quiz_redesign
  (id, user_id, action, points, day_number, idempotency_key, reason, created_at)
  SELECT id, user_id, action, points, day_number, idempotency_key, reason, created_at FROM points;
DROP TABLE IF EXISTS points;
ALTER TABLE points_quiz_redesign RENAME TO points;
CREATE INDEX IF NOT EXISTS idx_points_user ON points(user_id);
