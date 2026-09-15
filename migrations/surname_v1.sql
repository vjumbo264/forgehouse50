-- combined_fixes_v1 / Issue 1: required surname for new registrations.
-- DEFAULT '' keeps any existing rows valid (launch-wipe check: programme_config
-- shows started=false, so the participant table is empty post-wipe; the default
-- is belt-and-braces for any re-created admin/test rows).
ALTER TABLE profiles ADD COLUMN surname TEXT NOT NULL DEFAULT '';
