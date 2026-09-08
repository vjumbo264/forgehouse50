# ForgeHouse 50 — Design System v2

The token system and component contract behind the premium UI overhaul
(`ui_overhaul_v1`). Everything here is implemented in `public/app.css`
(tokens + components) and `public/app.js` (shell, icons, motion helpers).

**Design intent.** ForgeHouse 50 is a church Scripture-reading programme, so the
interface stays elegant, calm and premium — but it is *expressive*, not
institutional. The reference point for the expressive half is Duolingo:
confident colour, rounded friendly shapes, satisfying feedback, obvious
hierarchy, generous whitespace. The expressiveness lives in **colour, shape,
motion and feedback** — never in mascots, cartoon rewards or gamified
triviality. The Reading page in particular is treated as a serious reading
surface first.

---

## 1. Theming — automatic, never manual

There is **no theme toggle and no stored theme preference.** Both palettes are
declared in `app.css` behind `prefers-color-scheme`, so the visitor's
OS/browser setting is the single source of truth:

```css
:root { /* light palette */ }
@media (prefers-color-scheme: dark) { :root { /* dark palette */ } }
```

Consequences of doing it this way:

* Changing the system setting **while the app is open** re-renders instantly —
  no reload, no JS involvement, because it is a pure CSS media query.
* Nothing is persisted. `FH.initTheme()` actively **deletes** the legacy
  `localStorage['fh50_theme']` key and strips the legacy `data-theme`
  attribute from `<html>`, so an upgrading user is never trapped in a stale
  forced palette.
* `color-scheme: light dark` is set on `:root` so native form controls,
  scrollbars and the UA background follow along.
* The only JS is `syncThemeColor()`, which keeps
  `<meta name="theme-color">` matched to the active palette (browser chrome
  only, not app state) and listens to the media query for live changes.

**Do not** reintroduce a `[data-theme]` selector, a toggle control, or a
persisted preference.

---

## 2. Colour

### 2.1 Brand ramp — premium blue

| Token | Light | Dark | Use |
|---|---|---|---|
| `--brand-50` … `--brand-900` | `#eef4ff` → `#12306b` | `#101c33` → `#dae8fe` | Ramp; the ramp **inverts direction** in dark mode so higher numbers stay "more contrast against the background" |
| `--accent` | `#1d5bd6` | `#2f6ce4` | Filled button / active fill |
| `--accent-hover` | `#1747a8` | `#3d7cf2` | Hover |
| `--accent-text` | `#1747a8` (7.1:1) | `#85b0f7` (6.9:1) | Brand-coloured **text**, always AA+ |
| `--accent-soft` / `-soft-2` | `#eef4ff` / `#dbe7ff` | `#16253d` / `#1b3054` | Tinted chips, active nav, soft buttons |
| `--text-on-brand` | `#ffffff` | `#08122a` | Label on `--accent` fill |

The two palettes are designed independently. Dark mode is **not** an inverted
light mode: dark surfaces are cool navy-charcoals (`#0a1220` → `#1f2f48`) with
their own elevation logic (lighter = higher), and the brand ink lightens to
`#6a9df2`/`#85b0f7` so brand text stays legible instead of being a dark blue on
a dark background.

### 2.2 Surfaces

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f4f7fc` | `#0a1220` | Page |
| `--bg-tint` | soft blue radial | deep navy radial | Fixed page wash behind content |
| `--surface` | `#ffffff` | `#121c2c` | Cards, inputs, nav |
| `--surface-2` | `#eff4fc` | `#18253a` | Recessed / flat cards, panels |
| `--surface-3` | `#e4ecf9` | `#1f2f48` | Track fills, empty avatars, day numbers |
| `--surface-inv` | `#101a2b` | `#eaf1fb` | Toast background |

### 2.3 Text — contrast contract

Body text is **AA or better in both modes** (measured against `--surface`):

| Token | Light | Dark | Rule |
|---|---|---|---|
| `--text` | `#0f1a2e` — 15.9:1 | `#e9f0fb` — 14.2:1 | Body, headings, Scripture |
| `--text-dim` | `#43526b` — 8.5:1 | `#b3c4dc` — 8.4:1 | Secondary body, labels |
| `--text-mute` | `#5f6f88` — 5.4:1 | `#8e9fb8` — 5.3:1 | Metadata, captions — still AA for normal text |
| `--text-faint` | `#8494a9` — 3.2:1 | `#66768f` | **Decorative / placeholder / ≥19px only** — never body copy |

### 2.4 Semantic + expressive accents

`--ok` (green, completion), `--warn` (amber), `--danger` (red),
`--streak` (orange — streak/flame), `--purple` (questions), `--teal`
(introductions, rest days). Each has a `-soft` tint for chip backgrounds and,
where it is used as text, a `-text` variant tuned for contrast in that mode.

Highlight inks (`--hl-amber|green|blue|rose`) are pale washes in light mode and
deep saturated tints in dark mode, so highlighted Scripture stays readable
rather than glaring.

---

## 3. Typography

| Token | Value |
|---|---|
| `--font-ui` | Inter → system UI stack |
| `--font-read` | Iowan Old Style → Palatino → Charter → Georgia (serif) |
| `--font-mono` | system mono |

Scale: `--t-2xs 11` · `--t-xs 12.5` · `--t-sm 13.5` · `--t-md 15` (body) ·
`--t-lg 17` · `--t-xl 20` · `--t-2xl 24` · `--t-3xl 30` · `--t-4xl 36`.

Rules:

* **UI** uses `--font-ui` with tight tracking (`-0.005em` body,
  `-0.022em` headings) and weight 750–800 for headings.
* **Scripture** uses `--font-read` at `line-height: 1.78`, normal tracking,
  `text-rendering: optimizeLegibility`. This is the single most important
  typographic surface in the app: a serif, generous leading, and a comfortable
  measure (max ~680px wrap) for sustained reading in both modes.
* Reader size steps are user-controlled and independent of the UI scale:
  `.fs-small 16.5` · `.fs-medium 19` · `.fs-large 22` · `.fs-xlarge 25`.
* Verse numbers are UI-font, 800 weight, superscripted via
  `vertical-align: .42em` — they never disturb the serif rhythm.
* All numeric stats use `font-variant-numeric: tabular-nums` so values do not
  jitter as they update.

---

## 4. Spacing

4px base: `--s-1 4` · `--s-2 8` · `--s-3 12` · `--s-4 16` · `--s-5 20` ·
`--s-6 24` · `--s-8 32` · `--s-10 40` · `--s-12 48`.

Card padding is `--s-5` (mobile) and `--s-8` for the reader on ≥720px.
Page gutter is `--s-4` mobile / `--s-5` desktop. Content max-width is 680px.

---

## 5. Radius

`--r-xs 8` · `--r-sm 12` · `--r-md 16` · `--r-lg 20` · `--r-xl 28` ·
`--r-full 999`.

Friendly-but-serious: cards `--r-lg`, buttons/inputs `--r-md`, chips and pills
`--r-full`, modals `--r-xl`, day-number tiles 13px squircles.

---

## 6. Elevation

`--sh-1` (resting card) · `--sh-2` (hover) · `--sh-3` (modal-ish / auth card) ·
`--sh-4` (modal) · `--sh-brand` (coloured glow under primary buttons) ·
`--sh-inset-press` (pressed inset).

Dark mode uses deeper, more diffuse black shadows; elevation there is carried
mostly by surface lightness, with shadow as reinforcement.

---

## 7. Motion

| Token | Value | Use |
|---|---|---|
| `--d-1` | 110ms | Press / tap feedback |
| `--d-2` | 190ms | Hover, colour, small reveals |
| `--d-3` | 320ms | Section entrance, modal, sheet |
| `--d-4` | 620ms | Progress fill |
| `--e-out` | `cubic-bezier(.2,.8,.3,1)` | Default |
| `--e-spring` | `cubic-bezier(.34,1.4,.5,1)` | Playful overshoot (pop-in, selection) |

Inventory: button press `scale(.972)`; icon/chip press `scale(.94)`; nav press
`scale(.9)` with the active icon lifting and a top indicator bar; card tap
`scale(.988)`; `.rise` staggered section entrance; `.pop-in` / `.pulse-once`;
`fh-fn-in` footnote panel slide; progress bar and ring animate from 0 via
`FH.animateBar()` / `FH.animateRing()`; `FH.celebrate()` fires an 18-particle
radial bloom on day completion or badge earn; toasts spring in and fade out.

**`prefers-reduced-motion: reduce` is honoured globally.** One block collapses
every animation/transition to ~0ms, cancels all `:active`/`:hover` transforms,
disables the shimmer, and hides `.celebrate` entirely. `FH.celebrate()` also
early-returns, and `FH.animateBar/animateRing` set final values directly rather
than tweening. Nothing conveys information by motion alone.

---

## 8. Components

Every component below is built from the tokens above; none reskins old markup.

* **App bar** — `FH.topbar(title, extra)`: brand mark tile + wordmark +
  tagline, optional trailing actions. (The old theme-toggle button that used to
  live here is gone.)
* **Bottom nav** — `FH.nav(active)`: 6 destinations, translucent blurred
  `--surface`, safe-area padded, active item gets `--accent-soft` pill +
  3px top indicator + lifted icon, `aria-current="page"`.
* **Buttons** — `.btn` (primary, `--sh-brand`), `.btn.soft` (brand tint),
  `.btn.ghost` (outline), `.btn.danger`, `.btn.success`, `.btn.small`,
  `.btn.pill`. States: default / hover / `:active` scale / `:disabled` (50%,
  no shadow) / `.is-loading` (label hidden, centred spinner, `aria-busy`,
  width preserved) via `FH.setLoading(btn, on)`.
* **Icon button** — `.iconbtn`, 42px min touch target, `.is-on` for toggled.
* **Cards** — `.card`, `.card.flat`, `.card.tight`, `.card.tap` (pressable),
  `.card.hero` (brand gradient + light bloom), `.card.calm` / `.accented` /
  `.done-state` (semantic left border).
* **Stats** — `.stat` tile (`.v` value / `.l` uppercase label) and admin
  `.kpi` / `.kpi.brand`.
* **Progress** — `.bar` (12px track, gradient fill, glow) and `.ring`
  (conic-gradient, `--p` 0–100, `.on-hero` and `.sm` variants) via
  `FH.ring()`.
* **Streak** — `.streak-chip` with flame icon, `.is-cold` when 0.
* **Reading surface** — `.reader` + `.scripture` (`.v`, `.vn`, `.ch-head`),
  `.reader-tools` toolbar, `.intro-block` (teal, always expanded),
  `.fn-marker` / `.fn-panel` (see §9), highlight inks, `.audio` player with
  circular `.audio-play` and `.chip` chapter selector, `.attribution`.
* **Day cards** — `.dayrow` with `.daynum` squircle; `.done` (green) and
  `.today` (brand ring) states.
* **Tabs** — `.tabs` scrollable pill segmented control.
* **Leaderboard** — `.lrow` (rank / avatar / who / value), `.is-me`
  highlight, `.podium` medals.
* **Badges** — `.badge-grid` + `.badge-tile` (`.earned` gradient tile with
  brand-glow medallion, `.locked` muted); legacy `.badge` chip retained.
* **Notes** — `.note-card` with per-type left border (`.t-observation`,
  `.t-question`, `.t-scripture_connection`, `.t-application`, `.t-prayer`)
  and `.type-grid` / `.type-opt` icon-tile note-type selector.
* **Forms** — `input`/`select`/`textarea` at 16px+ (no iOS zoom), 1.5px
  border, 4px `--ring` focus halo, custom select chevron, `.input-sm`,
  `.otp-input`, `.field`, `.error` / `.ok-msg` tinted blocks that
  self-hide when empty.
* **Avatars** — `.avatar` (CSS-only circular crop over square sources),
  `.avatar-picker` responsive grid with brand double-ring + ✓ check on the
  selected tile.
* **Modals** — `FH.confirmDialog()`: blurred backdrop, bottom-sheet on
  mobile / centred on ≥560px, `role="dialog"` + `aria-modal`, Escape and
  backdrop dismiss, focus moved to the confirm button.
* **Toasts** — `FH.toast(msg, kind)` in an `aria-live="polite"` host above
  the nav.
* **Empty / loading** — `FH.empty(icon, title, sub)` and
  `FH.skeletonCard(n)` / `.skeleton` shimmer.
* **Admin** — `.kpi-grid`, `.data-row` with `.dr-meta`,
  `details.disclosure` (pill summary + `.panel`), `.control-row`.
* **Auth** — `body.auth` (nav hidden), `.auth-wrap`, `FH.authHead()`,
  `.auth-card`, `.auth-foot`.

---

## 9. Footnote rule (bug fix, `ui_overhaul_v1`)

**One marker per verse, always** — regardless of how many footnotes that verse
carries. Previously a verse with *n* footnotes rendered *n* markers.

* The marker (`.fn-marker`) is rendered once after the verse text. When the
  verse has more than one footnote it shows the first marker glyph plus a small
  `·n` count (`.fn-count`); with one footnote it shows just that glyph.
* Tapping it toggles **one** `.fn-panel` inserted directly after the verse,
  listing **all** of that verse's footnotes together as an ordered list, each
  prefixed by its own marker glyph (`.fn-mk`). A single footnote renders
  unlisted (`.fn-panel.single`).
* **Only one panel may be open in the chapter at a time**: opening any panel
  closes the previous one; tapping the open marker closes it.
* The marker carries `aria-expanded` and `aria-label`, and footnote taps are
  excluded from the verse-highlight handler.

---

## 10. Accessibility contract

* Body text meets WCAG AA in both palettes (§2.3); `--text-faint` is
  restricted to decorative/placeholder/large text.
* Every interactive target is ≥42px in at least one axis (nav items, icon
  buttons, chips, avatar tiles).
* Visible focus everywhere via `:focus-visible` + 3px `--ring` outline;
  inputs additionally get a 4px halo.
* Semantic landmarks: `<header class="appbar">`, `<nav class="bottom">`,
  `<main>`, `<section>`, `<article>` for note/day/participant records.
* State is never colour-only: completion pairs green with a ✓, streaks pair
  orange with a flame, the active nav item adds an indicator bar and
  `aria-current`.
* `aria-live` regions for toasts and async status text; `aria-busy` on loading
  buttons; `aria-expanded` on footnote markers and disclosures.
* `prefers-reduced-motion` fully honoured (§7).

---

## 11. Conventions

* Mobile-first; the only breakpoints are 420px (modal action columns),
  560px (modal centring) and 720px (desktop refinements).
* Use tokens, never raw hex, in component rules.
* New colours enter through the ramp or a semantic token — not inline.
* Page JS may add classes and call `FH.*` helpers, but must not write theme
  state or inline colour values.
