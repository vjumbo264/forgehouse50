-- Migration: admin_delete_and_login_v1
-- Adds dedicated admin credentials, admin sessions, login attempt tracking, and admin audit trail.

CREATE TABLE IF NOT EXISTS admin_credentials (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  iterations    INTEGER NOT NULL DEFAULT 100000,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id           TEXT PRIMARY KEY,
  admin_id     TEXT NOT NULL REFERENCES admin_credentials(id) ON DELETE CASCADE,
  expires_at   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  user_agent   TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions (admin_id);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id           TEXT PRIMARY KEY,
  identifier   TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  success      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_lookup ON admin_login_attempts (identifier, attempted_at);

CREATE TABLE IF NOT EXISTS admin_audit (
  id                  TEXT PRIMARY KEY,
  admin_id            TEXT NOT NULL,
  action              TEXT NOT NULL,
  target_user_id      TEXT,
  target_display_name TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
