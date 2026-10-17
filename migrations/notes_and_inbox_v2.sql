-- Migration: notes_and_inbox_v2
-- Fixes HTTP 500 on Insight note creation by adding 'insight' to notes.note_type CHECK constraint.
-- Extends leader_inbox to support 'prayer' and 'application' note types, allow_group_share, and first_sent_at / sent_at timestamps.

CREATE TABLE IF NOT EXISTS notes_new (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note_type    TEXT NOT NULL CHECK (note_type IN ('observation','question','scripture_connection','application','prayer','insight')),
  body         TEXT NOT NULL,
  book         TEXT NOT NULL,
  chapter      INTEGER NOT NULL,
  verse        INTEGER,
  day_number   INTEGER REFERENCES reading_days(day_number) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO notes_new (id, user_id, note_type, body, book, chapter, verse, day_number, created_at, updated_at)
SELECT id, user_id, note_type, body, book, chapter, verse, day_number, created_at, updated_at FROM notes;

DROP TABLE notes;
ALTER TABLE notes_new RENAME TO notes;

CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_notes_user_type ON notes(user_id, note_type);
CREATE INDEX IF NOT EXISTS idx_notes_user_day ON notes(user_id, day_number);

CREATE TABLE IF NOT EXISTS leader_inbox_new (
  id TEXT PRIMARY KEY,
  note_id TEXT UNIQUE,
  author_user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('observation', 'question', 'prayer', 'application')),
  reference TEXT NOT NULL,
  text TEXT NOT NULL,
  show_name INTEGER NOT NULL DEFAULT 0,
  allow_group_share INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'answered', 'published', 'hidden')),
  first_sent_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO leader_inbox_new (id, note_id, author_user_id, type, reference, text, show_name, allow_group_share, status, first_sent_at, sent_at, created_at, updated_at)
SELECT id, note_id, author_user_id, type, reference, text, show_name, 0, status, created_at, updated_at, created_at, updated_at FROM leader_inbox;

DROP TABLE leader_inbox;
ALTER TABLE leader_inbox_new RENAME TO leader_inbox;

CREATE INDEX IF NOT EXISTS idx_leader_inbox_author ON leader_inbox(author_user_id);
CREATE INDEX IF NOT EXISTS idx_leader_inbox_status ON leader_inbox(status, created_at);

INSERT OR IGNORE INTO leader_inbox (id, note_id, author_user_id, type, reference, text, show_name, allow_group_share, status, first_sent_at, sent_at, created_at, updated_at)
SELECT n.id, n.id, n.user_id, n.note_type,
       n.book || ' ' || n.chapter || CASE WHEN n.verse IS NOT NULL THEN ':' || n.verse ELSE '' END,
       n.body, 0, 0, 'new', n.created_at, n.updated_at, n.created_at, n.updated_at
FROM notes n
WHERE n.note_type IN ('prayer', 'application');
