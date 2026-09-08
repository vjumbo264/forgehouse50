# Avatar illustrations (pwa_and_avatars_v1 Part B)

41 square (1024×1024) full-bleed flat-illustration avatar images, fetched
from the operator's public Google Drive folder on 2026-09-08, validated
(square, no baked-in circular crop, no text/watermark) and stored with
clean sequential ids `avatar-01.png` … `avatar-41.png`.

These replace the old inline-SVG `{icon}-{color}` preset set from
`profile_content_cleanup_v1` (task-p05), which was code-only and left no
image assets behind. The ids are the single source of truth shared by
`public/app.js` (`FH.AVATARS`) and `functions/lib/avatars.mjs`
(`AVATAR_IDS`); the circular crop users see is applied purely by CSS
(`.avatar { border-radius: 50% }` + `object-fit: cover`), so the source
PNGs stay full squares.

Source-to-id mapping (Drive filename → id) is recorded in
`BUILD_STATE.json` → `pwa_and_avatars_v1` → task-w06 notes.
