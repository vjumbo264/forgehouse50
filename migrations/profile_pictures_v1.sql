-- Migration: profile_pictures_v1 (fixes_oct15_v1 Item 7a)
-- User profile photo storage in D1 with versioning and rate-limiting
CREATE TABLE IF NOT EXISTS profile_pictures (
  user_id      TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  bytes        BLOB NOT NULL,
  version      INTEGER NOT NULL DEFAULT 1,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_profile_pictures_user_id ON profile_pictures(user_id);

CREATE TABLE IF NOT EXISTS profile_picture_uploads (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_profile_picture_uploads_user_date ON profile_picture_uploads(user_id, uploaded_at);
