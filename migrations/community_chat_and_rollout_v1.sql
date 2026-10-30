-- Migration: community_chat_and_rollout_v1
-- Supports community group chat, direct messages with admin, moderation, update rollout channels, and rest day catch-up settings.

CREATE TABLE IF NOT EXISTS community_chat_messages (
  id                  TEXT PRIMARY KEY,
  channel_type        TEXT NOT NULL CHECK (channel_type IN ('group', 'direct')),
  direct_thread_id    TEXT,
  sender_user_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_user_id   TEXT REFERENCES profiles(id) ON DELETE CASCADE,
  reply_to_message_id TEXT REFERENCES community_chat_messages(id) ON DELETE SET NULL,
  text                TEXT NOT NULL,
  is_deleted          INTEGER NOT NULL DEFAULT 0,
  deleted_by          TEXT REFERENCES profiles(id),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_group_created ON community_chat_messages(channel_type, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_direct_thread ON community_chat_messages(channel_type, direct_thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_recipient ON community_chat_messages(recipient_user_id, created_at);

CREATE TABLE IF NOT EXISTS community_chat_members (
  user_id             TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  is_muted            INTEGER NOT NULL DEFAULT 0,
  muted_at            TEXT,
  muted_by            TEXT REFERENCES profiles(id),
  last_read_group_at  TEXT,
  last_read_direct_at TEXT,
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS app_releases (
  version_code        INTEGER PRIMARY KEY,
  version_name        TEXT NOT NULL,
  tag                 TEXT NOT NULL,
  apk_url             TEXT NOT NULL,
  size_bytes          INTEGER NOT NULL DEFAULT 0,
  sha256              TEXT,
  changelog           TEXT,
  rollout_state       TEXT NOT NULL DEFAULT 'hold' CHECK (rollout_state IN ('hold', 'admins_only', 'everyone')),
  mandatory           INTEGER NOT NULL DEFAULT 0,
  updated_by          TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT OR IGNORE INTO programme_config (key, value, updated_at)
VALUES ('rest_day_catchup_cutoff_time', '19:00', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
