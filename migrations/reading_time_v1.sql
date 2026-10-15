-- Migration: reading_time_v1 (fixes_oct15_v1 Item 2a)
-- Additive columns to reading_progress for offline timer and active reading measurement

ALTER TABLE reading_progress ADD COLUMN first_opened_at TEXT;
ALTER TABLE reading_progress ADD COLUMN final_chapter_reached_at TEXT;
ALTER TABLE reading_progress ADD COLUMN time_source TEXT DEFAULT 'client';
