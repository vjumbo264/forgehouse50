-- Migration: community_chat_v3
-- Adds client_msg_id for optimistic send deduplication (k3) and deleted_at for member/admin soft-delete (k5).
ALTER TABLE community_chat_messages ADD COLUMN client_msg_id TEXT;
ALTER TABLE community_chat_messages ADD COLUMN deleted_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_client_msg_id
  ON community_chat_messages(sender_user_id, client_msg_id)
  WHERE client_msg_id IS NOT NULL;
