-- Migration: admin_reset_day_v1 (fixes_oct15_v1 Item 4)
-- Additive audit columns for day reset operations
ALTER TABLE admin_audit ADD COLUMN day_number INTEGER;
ALTER TABLE admin_audit ADD COLUMN points_reversed INTEGER DEFAULT 0;
ALTER TABLE admin_audit ADD COLUMN previous_reading_seconds INTEGER DEFAULT 0;
ALTER TABLE admin_audit ADD COLUMN previous_quiz_score TEXT;
ALTER TABLE admin_audit ADD COLUMN request_id TEXT;
CREATE INDEX IF NOT EXISTS idx_admin_audit_request_id ON admin_audit(request_id);
