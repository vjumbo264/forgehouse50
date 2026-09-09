# ForgeHouse 50 — Design System v4

A deliberately small design system. The goal is a calm, legible,
premium-through-restraint interface appropriate for a Bible-reading app:
quiet neutral surfaces, generous whitespace, typographic hierarchy doing
most of the visual work, and **one restrained muted-blue accent** used
sparingly.

This replaces the entire previous (v2, expressive) direction, which was
reverted. Keep it simple — do not add tokens without a real need.

## Theming

- Light/dark is **automatic** via `prefers-color-scheme`. There is no
  manual toggle and no stored preference; `FH.initTheme()` only removes
  legacy stored keys/attributes and keeps the `theme-color` meta in sync.
- Both palettes are defined in `app.v4.css` (`:root` and
  `@media (prefers-color-scheme: dark)`). Never hardcode a theme.

## Color tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#fafaf8` | `#171614` | page background (warm off-white / warm near-black) |
| `--surface` | `#ffffff` | `#201f1c` | cards, nav, inputs |
| `--surface-2` | `#f2f2ef` | `#2a2925` | recessed/flat surfaces, segmented-control track |
| `--border` / `--border-strong` | `#e6e6e1` / `#d4d4cd` | `#353330` / `#48453f` | hairlines / interactive borders |
| `--text` | `#1f1e1c` | `#ebe8e1` | primary text |
| `--text-dim` / `--text-mute` / `--text-faint` | — | — | secondary → tertiary text |
| `--accent` | `#3a5f8a` | `#7f9fc4` | the single muted-blue accent: primary buttons, active states, key indicators |
| `--accent-text` | `#2d4e74` | `#9db8d6` | accent used as text/line color (AA on its background) |
| `--accent-soft` / `--accent-soft-2` | 9% / 17% tint | 13% / 24% tint | subtle accent washes (pills, active segment fill) |
| `--on-accent` | `#ffffff` | `#101a26` | text on the filled accent |
| `--ok` / `--danger` | — | — | success / destructive only |

Rules: the accent is for primary actions and key state only — never wash
it across large surfaces. Everything else is neutral.

## Type

- UI: system stack (`--font-ui`). Reading text: Georgia serif (`--font-read`).
- Scale: h1 24 / h2 18 / h3 15 / body 16–17 / small 13 / label 12–13.
- Weights: 400 body, 600–650 headings/buttons. Hierarchy carries the design.

## Spacing, radius, shadow

- Spacing rhythm: 6 / 10 / 12 / 14 / 18 / 20 px; wrap padding 20/16.
- Radius: `--radius` 12 (cards), `--radius-sm` 8 (buttons, inputs), pills 99.
- Shadow: one quiet `--shadow` (1px, ~5–25% opacity) on elevated cards and
  primary buttons only. No colored or layered shadows.

## Motion

- Fast, simple transitions only: 0.12s ease on hover/active state changes
  (border, color, opacity, background); 0.4s on progress bars.
- No bouncy easing, no celebratory or attention-seeking animation.
- `prefers-reduced-motion: reduce` collapses all transitions/animations
  app-wide (implemented globally in `app.v4.css`).

## Icons

- **No emojis anywhere in the UI.** Icons come from the single inline SVG
  set in `FH.ICONS` (`app.v4.js`): 24×24 viewBox, 2px stroke, rounded
  joins, `currentColor`. Add new icons there, in the same style.
- **Every icon is sized by CSS, never by the SVG's intrinsic 300×150
  default.** The rule set covers nav (`21px`), `.iconbtn` (`15px`),
  `.btn`/`.btn.ghost` (`16px`), `.check` (`17px`) and the audio player
  (`20px` play, `16px` skips). Inject icons only into elements those rules
  cover; if a new context is added, add a sizing rule for it.

## Components (contract)

- `.btn` filled accent = the one primary action per view;
  `.btn.ghost` bordered surface = secondary actions (clear hover state:
  border + text take the accent). `.btn.small` for inline/compact actions.
- `.iconbtn` small bordered button for icon/utility actions; always has a
  visible border and a hover state so it reads as tappable.
- Notes save/edit buttons must always read as obviously clickable: filled
  or clearly bordered shape plus hover/active/focus states — never bare
  text, never oversized banner styling.
- `.card` / `.card.flat`, `.pill`, `.badge`, `.stat`, `.tabs`, `.dayrow`,
  `.lrow` as defined in `app.v4.css` — reuse before inventing.
- Reading page: `.reader-pane` is a fixed-max-height internally scrolling
  chapter pane; Prev/Next chapter controls live outside it and are always
  visible.
- **Audio player**: Play/Pause is the single filled circular primary
  action (`#audio-play`, 46px); ±5s skips are quiet circular `.iconbtn`s;
  downloads are secondary `.btn.ghost.small` text+icon buttons. The
  chapter picker (`#audio-chapters`) is a calm segmented control: the
  active segment gets a subtle `--accent-soft-2` fill and accent text —
  never a high-contrast outline. The seek slider's filled track before the
  thumb is the accent, driven by the `--fill` custom property.
