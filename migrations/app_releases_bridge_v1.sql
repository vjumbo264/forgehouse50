-- k12 (FH-002): track first-rollout ForgeBuild bridge intent & completion per release.
ALTER TABLE app_releases ADD COLUMN publish_to_forgebuild INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_releases ADD COLUMN bridged INTEGER NOT NULL DEFAULT 0;
