# ForgeHouse 50 — Missing Chapter 6 Bug Audit (Item 2)
Date: 2026-10-15
Investigator: ForgeHouse Builder AI

## 1. Bug Report & Symptoms
- Member report: After reading chapter 5, chapter 6 never appeared.
- Operator Day 3 screenshot: Verses of a chapter cut off at the bottom panel (timer and button).
- Viewport report: Content stops at a fixed height above the bottom panel and cannot scroll further down.

## 2. Translation Bundles Audit (All 12 Bundles, All 50 Days, All 260 Chapters)
- Audited using `/tmp/audit_bundles.py` against `seed/seed.sql` schedule (72 assignment rows, 50 days, 260 NT chapters).
- Results across all bundles:
  * `amp.json.gz`: 260/260 chapters present (0 missing, 0 empty)
  * `cev.json.gz`: 260/260 chapters present (0 missing, 0 empty)
  * `gw.json.gz`: 260/260 chapters present (0 missing, 0 empty)
  * `kjv.json.gz`: 260/260 chapters present (0 missing, 0 empty)
  * `msg.json.gz`: 260/260 chapters present (0 missing, 0 empty)
  * `niv.json.gz`: 260/260 chapters present (0 missing, 0 empty)
  * `nkjv.json.gz`: 260/260 chapters present (0 missing, 0 empty)
  * `nlt.json.gz`: 260/260 chapters present (0 missing, 0 empty)
  * `nlv.json.gz`: 260/260 chapters present (0 missing, 0 empty)
  * `tlb.json.gz`: 260/260 chapters present (0 missing, 0 empty)
  * `tpt.json.gz`: 260/260 chapters present (0 missing, 0 empty)
  * `voice.json.gz`: 260/260 chapters present (0 missing, 0 empty)
- Finding: Every chapter of every day exists and has non-empty verses in all 12 bundles. There are zero missing chapters in the underlying data.

## 3. Root Cause Analysis

### A. Web Client Bundle & API Query Disconnect
1. In `ReaderView.tsx`:
   - Bundle schema check assumed `bundle.books[book].chapters[chapter]`, but VerseWell translation bundles have root schema `bundle[book][chapter]` with verse key `"v"`. Because `bundle.books` evaluated to `undefined`, bundle lookup always failed.
   - Fallback HTTP fetch called `/api/read/passage?book=${b.book}&chapter=${b.chapter}&translation=${d.toLowerCase()}`.
   - However, `functions/api/read/passage.mjs` expected parameters `chapter_start`, `chapter_end`, and a prefixed VerseWell ID `versewell-${code}`. Because `chapter_start` was absent and code was unprefixed, the API rejected the request with HTTP 400 Bad Request.
   - The catch block in `ReaderView.tsx` attempted to call `ut(b.book, b.chapter)` as a fallback mock verse generator. In the bundled minified code, `ut` was bound to React DOM's internal `getNodeFromInstance()` function, which threw `Error: getNodeFromInstance: Invalid argument`.
   - As a result, chapter 6 (and any chapter when the API failed) could never render.
2. In `functions/api/read/day.mjs`:
   - Expected `searchParams.get('n')`, while `ReaderView.tsx` queried `?day=${dayNumber}`. This caused `/api/read/day` to return 400 Bad Request, leaving the website with hardcoded initial state `[Matthew 1..6]` on all days.

### B. Viewport & Scroll Container Clipping (App and Web)
1. In Android `ReadScreen.kt`:
   - Chapter pane was wrapped in `Box(Modifier.fillMaxWidth().weight(1f).clipToBounds())` above a fixed bottom bar.
   - Because of hard clipping and fixed overlay reservation, the bottom verses of longer chapters were cut off behind the bottom bar and could not scroll into view.
   - Chapter navigation required explicitly clicking a top `Next` button; there was no continuous scrolling between chapters within a day.
2. In Web `ReaderView.tsx`:
   - Used pagination with fixed bottom controls; users reached the end of chapter 5 with no clear transition to chapter 6.

## 4. Remediation Steps
1. Backend (`functions/api/read/day.mjs` & `passage.mjs`):
   - Accept both `n` and `day` in `day.mjs`.
   - Accept both `chapter` and `chapter_start`/`chapter_end` in `passage.mjs`.
   - Accept both raw codes (`kjv`, `amp`) and full VerseWell IDs (`versewell-kjv`).
2. Web Reader:
   - Handle both bundle schemas (`bundle[book][chapter]` with `"v"` and `bundle.books[book].chapters`).
   - Implement continuous scrolling where all chapters of the day render sequentially.
3. Android Reader:
   - Edge-to-edge layout with content padding scrolling behind floating translucent bars.
   - Continuous chapter scrolling with LazyColumn.
