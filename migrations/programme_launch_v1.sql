-- programme_launch_and_finale_v1 / task-l01 — schema migration (idempotent).
--
-- 1) programme_config — key/value store for the ONE global programme-run
--    lifecycle: start_at (admin Start Programme press), join_window_closes_at
--    (ISO date, EXCLUSIVE), programme_end_date (computed once at window
--    close), final_snapshot_at (set when the permanent snapshot is taken).
-- 2) final_rankings — the one-time, permanent final leaderboard for a run.
--    run_id = the run's start date (keeps the door open to a future run
--    without supporting concurrent runs). Immutable once written: the
--    snapshot logic only ever runs when final_snapshot_at is unset.
-- 3) final_rank_acks — per-user acknowledgement of the one-time top-3
--    celebration banner (so it is shown exactly once per user per run).

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
  total_points INTEGER NOT NULL,          -- RAW total accumulated points (not damped)
  finished_at  TEXT,                      -- completed_at of reading day 50 (tiebreak provenance)
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
