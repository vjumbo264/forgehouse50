-- Migration: leader_inbox_and_community_v1
-- Adds leader inbox, version tracking, and community replies for observations and questions

CREATE TABLE IF NOT EXISTS leader_inbox (
  id TEXT PRIMARY KEY,
  note_id TEXT UNIQUE,
  author_user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('observation', 'question')),
  reference TEXT NOT NULL,
  text TEXT NOT NULL,
  show_name INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'answered', 'published', 'hidden')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_leader_inbox_author ON leader_inbox(author_user_id);
CREATE INDEX IF NOT EXISTS idx_leader_inbox_status ON leader_inbox(status, created_at);

CREATE TABLE IF NOT EXISTS leader_inbox_versions (
  id TEXT PRIMARY KEY,
  inbox_id TEXT NOT NULL REFERENCES leader_inbox(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  edited_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_leader_inbox_versions_inbox ON leader_inbox_versions(inbox_id);

CREATE TABLE IF NOT EXISTS community_replies (
  id TEXT PRIMARY KEY,
  inbox_id TEXT NOT NULL REFERENCES leader_inbox(id) ON DELETE CASCADE,
  admin_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_community_replies_inbox ON community_replies(inbox_id);

-- Backfill existing observation and question notes into leader_inbox (with show_name = 0, status = 'new')
INSERT OR IGNORE INTO leader_inbox (id, note_id, author_user_id, type, reference, text, show_name, status, created_at, updated_at)
SELECT n.id, n.id, n.user_id, n.note_type,
       n.book || ' ' || n.chapter || CASE WHEN n.verse IS NOT NULL THEN ':' || n.verse ELSE '' END,
       n.body, 0, 'new', n.created_at, n.updated_at
FROM notes n
WHERE n.note_type IN ('observation', 'question');
