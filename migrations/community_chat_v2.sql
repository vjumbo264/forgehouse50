-- Migration: community_chat_v2
-- Recreates empty v1 chat tables so dedicated admin_credentials actors
-- (Pastor Dave / ForgeHouse Admin, who live in admin_credentials rather than profiles)
-- can post, moderate, and track per-thread read state with zero FK conflicts
-- and minimal D1 write consumption.

DROP TABLE IF EXISTS community_chat_thread_reads;
DROP TABLE IF EXISTS community_chat_messages;
DROP TABLE IF EXISTS community_chat_members;

CREATE TABLE IF NOT EXISTS community_chat_messages (
  id                  TEXT PRIMARY KEY,
  channel_type        TEXT NOT NULL CHECK (channel_type IN ('group', 'direct')),
  direct_thread_id    TEXT,
  sender_user_id      TEXT NOT NULL,
  sender_role         TEXT NOT NULL DEFAULT 'member' CHECK (sender_role IN ('member', 'admin')),
  sender_display_name TEXT NOT NULL DEFAULT '',
  recipient_user_id   TEXT,
  reply_to_message_id TEXT REFERENCES community_chat_messages(id) ON DELETE SET NULL,
  text                TEXT NOT NULL,
  is_deleted          INTEGER NOT NULL DEFAULT 0,
  deleted_by          TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_group_created
  ON community_chat_messages(channel_type, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_group_updated
  ON community_chat_messages(channel_type, updated_at);
CREATE INDEX IF NOT EXISTS idx_chat_direct_thread_created
  ON community_chat_messages(channel_type, direct_thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_direct_thread_updated
  ON community_chat_messages(channel_type, direct_thread_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_chat_sender_created
  ON community_chat_messages(sender_user_id, created_at);

CREATE TABLE IF NOT EXISTS community_chat_members (
  user_id             TEXT PRIMARY KEY,
  is_muted            INTEGER NOT NULL DEFAULT 0,
  muted_at            TEXT,
  muted_by            TEXT,
  last_read_group_at  TEXT,
  last_read_direct_at TEXT,
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS community_chat_thread_reads (
  reader_id           TEXT NOT NULL,
  thread_id           TEXT NOT NULL,
  last_read_at        TEXT NOT NULL,
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (reader_id, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_thread_reads_thread
  ON community_chat_thread_reads(thread_id);
