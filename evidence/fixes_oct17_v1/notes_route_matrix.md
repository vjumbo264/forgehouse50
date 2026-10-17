# Notes & Community Route Matrix (Contract Audit)

Generated on: 2026-10-17

| Client / Caller | HTTP Method | Request Path | Target Handler | Supported | Notes & Compatibility |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Android (v24–v27, v29+) | `GET` | `/api/notes` | `functions/api/notes/index.mjs` | YES | User-scoped note retrieval with `q`, `type`, `day` query params |
| Android (v24–v27, v29+) | `POST` | `/api/notes` | `functions/api/notes/index.mjs` | YES | Create note; supports observation, question, prayer, application, insight |
| Android (v24–v27, v29+) | `PUT` | `/api/notes/:id` | `functions/api/notes/[id].mjs` | YES | Update note body, note_type, show_name, allow_group_share |
| Android (v28 fallback) | `PUT` | `/api/notes` | `functions/api/notes/index.mjs` | YES | Fallback with `id` in query or body; resolves 405 error on v28 builds |
| Android (generic/alt) | `PATCH` | `/api/notes/:id` | `functions/api/notes/[id].mjs` | YES | Partial update |
| Android (generic/alt) | `POST` | `/api/notes/:id` | `functions/api/notes/[id].mjs` | YES | Update alias for POST requests |
| Android (v24–v29+) | `DELETE` | `/api/notes/:id` | `functions/api/notes/[id].mjs` | YES | Delete own note; preserves leader inbox copy per policy |
| Android & Web | `GET` | `/api/notes/:id/status` | `functions/api/notes/[id]/status.mjs` | YES | Check sent-to-leaders status, answered state, and reply |
| Android & Web | `GET` | `/api/me/notes/:id/status`| `functions/api/me/notes/[id]/status.mjs` | YES | Route alias for status |
| Website | `GET` | `/api/notes` | `functions/api/notes/index.mjs` | YES | Web notes list |
| Website | `POST` | `/api/notes` | `functions/api/notes/index.mjs` | YES | Web note creation |
| Website | `PUT` | `/api/notes/:id` | `functions/api/notes/[id].mjs` | YES | Web note edit |
| Website | `DELETE` | `/api/notes/:id` | `functions/api/notes/[id].mjs` | YES | Web note delete |
| Community Feed | `GET` | `/api/community/latest` | `functions/api/community/latest.mjs` | YES | Fetches latest answered community item for home card |
| Community Feed | `GET` | `/api/community/posts` | `functions/api/community/posts.mjs` | YES | Paginated feed of published community items |
| Admin Leaders Inbox | `GET` | `/api/admin/inbox` | `functions/api/admin/inbox/index.mjs` | YES | List inbox items (filter by status, type, user, search) |
| Admin Leaders Inbox | `POST` | `/api/admin/inbox/:id/reply` | `functions/api/admin/inbox/[id]/reply.mjs` | YES | Leader reply composer |
| Admin Leaders Inbox | `POST` | `/api/admin/inbox/:id/publish` | `functions/api/admin/inbox/[id]/publish.mjs` | YES | Leader publish to community feed |
| Admin Leaders Inbox | `POST` | `/api/admin/inbox/:id/hide` | `functions/api/admin/inbox/[id]/hide.mjs` | YES | Leader hide item |

### Released App Version Contract Compatibility
- `forgehouse50-v24` to `v27`: Used `PUT /notes/$id`. Full native support on `functions/api/notes/[id].mjs` (`onRequestPut`).
- `forgehouse50-v28`: Used `PUT /notes/` without `$id` in path. Handled via `functions/api/notes/index.mjs` fallback extracting `id` from body or query, preventing 405 Method Not Allowed.
- `forgehouse50-v29` & `v30+`: Uses hardened `PUT /notes/$id` with explicit `id` in path and body.
