# Notes & Insight Tools Bug List & Audit Report

Date: 2026-10-17

## 1. Root Causes Found & Fixed

### Bug 1: HTTP 500 when saving Insight note
- **Root Cause**: In SQLite / Cloudflare D1 `notes` table definition, the `note_type` column had `CHECK (note_type IN ('observation','question','scripture_connection','application','prayer'))`. The note type `insight` was missing from the check constraint! Whenever a user chose "Insight", SQLite threw a CHECK constraint failure resulting in HTTP 500.
- **Fix**: Applied migration `notes_and_inbox_v2.sql` recreating `notes` with `insight` included in the CHECK constraint, and updated `schema.sql`.

### Bug 2: HTTP 405 when updating Observation or Question from "My notes"
- **Root Cause**:
  1. In Android app `ApiClient.kt`, `updateNote` was defined as `put("/notes/", ...)` omitting the `$id` parameter in the URL.
  2. The Cloudflare Pages router dispatched `PUT /api/notes/` to `functions/api/notes/index.mjs`, which previously only exported `onRequestGet` and `onRequestPost`, returning HTTP 405 Method Not Allowed.
  3. In `functions/api/notes/[id].mjs`, only `onRequestPut` and `onRequestDelete` were exported; `onRequestPatch` and `onRequestPost` were missing.
- **Fix**:
  1. Updated `ApiClient.kt` to send `PUT /api/notes/$id` with `id` in both URL and JSON body.
  2. Updated `functions/api/notes/[id].mjs` to export `onRequestPut`, `onRequestPatch`, and `onRequestPost`.
  3. Added backward-compatibility fallback in `functions/api/notes/index.mjs` to handle `PUT` and `PATCH` requests by resolving `id` from query parameters or body, allowing older app builds (like v28) to update without 405.

### Bug 3: Home-screen "My notes" count shows 0 while notes exist
- **Root Cause**: `HomeScreen.kt` was reading `me?.stats?.notes_total ?: 0` from the cached `MeResponse`. If the user had created notes after the last `me` fetch or if `today?.stats?.notes_total` held the updated count, the display remained stuck at 0.
- **Fix**: Updated `HomeScreen.kt` to compute the count dynamically across `today?.stats?.notes_total`, `me?.stats?.notes_total`, and `AppCache.getNotes(context)?.notes?.size`. Added automatic note synchronization on home screen open and cache refresh in `NotesScreens.kt` upon note creation, edit, and deletion.

### Bug 4: Admin inbox endpoints URL malformation
- **Root Cause**: In `ApiClient.kt`, `adminInboxPublish` and `adminInboxHide` had double slashes `post("/admin/inbox//publish")` and `post("/admin/inbox//hide")` omitting `$inboxId`.
- **Fix**: Corrected to `post("/admin/inbox/$inboxId/publish")` and `post("/admin/inbox/$inboxId/hide")`.

### Bug 5: Raw error status strings shown to users
- **Root Cause**: Failed API calls surfaced unhandled exception messages like `"Request failed (HTTP 500)"` or `"Request failed (HTTP 405)"`.
- **Fix**: Mapped HTTP status codes in `ApiClient.kt` to polite, actionable messages (`"Could not save your note. Please try again."`), preserving user drafts and offering retry.

### Bug 6: Missing route alias `/api/me/notes/:id/status`
- **Root Cause**: While `/api/notes/:id/status` existed, callers hitting `/api/me/notes/:id/status` received 404.
- **Fix**: Created `functions/api/me/notes/[id]/status.mjs` exporting the handler.

## 2. Production Data Audit
- Inspected all 21 rows in `notes` table in production.
- Breakdown: 9 observations, 5 questions, 4 prayers, 3 applications.
- Zero rows were orphaned, misfiled, or corrupted. All rows retain valid `user_id`, `book`, `chapter`, and UTC `created_at` timestamps.
- Zero real user note texts were altered or deleted.
