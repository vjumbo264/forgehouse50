-- Migration: smoke_test_exclusion_v1
-- Non-destructive column for dedicated post-deploy smoke test account exclusion.
ALTER TABLE profiles ADD COLUMN is_smoke_test INTEGER NOT NULL DEFAULT 0;
