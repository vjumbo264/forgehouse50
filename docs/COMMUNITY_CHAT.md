# Community Chat Architecture & Cloudflare D1 Budget (`i9`)

## Overview
ForgeHouse 50 Community Chat provides two communication spaces inside the Community area:
1. **Group Chat**: One shared conversation for all authenticated programme participants and leadership, with message replies (`reply_to_id`), older-history pagination (`?before=`), incremental polling (`?since=`), soft-delete moderation, member muting, and per-user rate limiting (10 messages / 60s).
2. **Direct Messages with Leadership**: Private 1:1 threads (`direct_thread_id = member_user_id`) between leadership (`admin_credentials`) and an individual member.
   - Admins can start a private thread with any verified member and view all active direct threads.
   - A member can view and reply **only** in their own private thread (`thread_id === user.id`), and **only after** an admin has initiated that thread (`403 Forbidden` otherwise).
   - Members can never read or post to another member's thread or message other members privately.

## Privacy Guarantees
- Member names are formatted server-side as `Given S.` (first name + surname initial).
- Full surnames, email addresses, phone numbers, and internal admin login usernames (`admin_credentials.username`) are **never** returned in any chat or directory payload.
- Admin messages display as `Pastor Dave` (or `ForgeHouse Admin` / `programme_config.chat_admin_display_name`) with `author_role: "admin"`.

## Cloudflare Free Tier D1 Read/Write Budget
Cloudflare D1 Free Tier limits:
- **Rows read**: 5,000,000 / day
- **Rows written**: 100,000 / day
- **Workers requests**: 100,000 / day

### Write-Saving Design
1. **Zero-write idle polling**: `markGroupReadIfNewer` and `markDirectThreadReadIfNewer` only execute an `INSERT ... ON CONFLICT DO UPDATE` when a newly fetched message timestamp strictly exceeds the reader's stored `last_read_*` watermark. Idle `?since=` polls perform **0 D1 writes**.
2. **Foreground-only polling**: Android polls `/api/community/chat/...?since=<last_timestamp>` every 4 seconds **only** while the user has `CommunityScreen` open and in the foreground (`Lifecycle.State.RESUMED`). When navigated away or backgrounded, polling stops completely.
3. **Composite indexes**:
   - `idx_chat_group_created (channel_type, created_at)`
   - `idx_chat_group_updated (channel_type, updated_at)`
   - `idx_chat_direct_thread_created (channel_type, direct_thread_id, created_at)`
   - `idx_chat_direct_thread_updated (channel_type, direct_thread_id, updated_at)`
   - `idx_chat_sender_created (sender_user_id, created_at)`
   Ensure every incremental `?since=` poll scans `0` message rows when idle.

### Expected Daily Load (100 active church members)
- **Messages sent**: ~200–500 messages/day -> ~400–1,000 writes/day (message insert + sender read watermark).
- **Read watermark updates**: At most 1 write per active reader per burst of new messages -> ~500–1,500 writes/day.
- **Total expected chat D1 writes**: **~1,500–3,000 writes/day (< 3% of the 100,000/day free limit)**.
- **Foreground polling**: Assuming 100 members each spend ~5 minutes/day inside Community Chat (75 polls x 100 = 7,500 requests/day), each idle indexed `since` check reads 1–2 metadata rows -> **~15,000–35,000 rows read/day (< 0.7% of the 5,000,000/day free limit)**.
