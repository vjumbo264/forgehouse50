# ForgeHouse 50 — Design System

## 1. Principles & Intent
The visual identity of ForgeHouse 50 mirrors the official Android application built with Material 3 Expressive and Plus Jakarta Sans.
- **Zero-Pill Static Discipline**: Informational metadata (dates, chapters, statuses) is presented as clean, unboxed text with typographic separators (`·`), reserving bordered and filled containers exclusively for functional controls (buttons, tabs, action chips).
- **Legibility Guarantee**: Body text weight is never thin or hairline. Base weight is 400 minimum, secondary and small text is 500, interactive labels are 600, headlines are 700.
- **System Dark/Light Theme**: Theme automatically adapts via CSS `@media (prefers-color-scheme: dark)` without artificial toggles.
- **Zero Emojis**: Every indicator, category, and action utilizes semantic SVG icons.

---

## 2. Typography
- **Primary Typeface**: Plus Jakarta Sans (Google Fonts + fallback `system-ui, -apple-system, sans-serif`)
- **Weights**:
  - `font-normal` (400) — Base prose, scripture verse text
  - `font-medium` (500) — Body descriptions, footnotes, secondary labels
  - `font-semibold` (600) — Buttons, navigation tabs, section headers, badges
  - `font-bold` (700) — Numbers, metric counters, headlines
- **Scale**:
  - Display: `32px` / `2rem` (Bold)
  - Headline: `24px` / `1.5rem` (Bold)
  - Title: `18px` / `1.125rem` (SemiBold)
  - Body: `15px`–`16px` / `1rem` (Regular / Medium, line-height 1.6)
  - Label / Small: `13px` / `0.8125rem` (Medium / SemiBold)
  - Micro: `11px` / `0.6875rem` (SemiBold)

---

## 3. Color Tokens
Derived from the brand identity and the Android native color tokens:

### Light Mode (`prefers-color-scheme: light`)
- **Canvas / Background**: `#F9F9F6`
- **Surface**: `#FFFFFF`
- **Surface Variant**: `#E7ECE7`
- **Text Primary**: `#191C1A`
- **Text Secondary / Muted**: `#414942`
- **Border / Outline**: `#C1C9C0`
- **Brand Primary**: `#2E6B4F` (Forest Green)
- **Brand Primary Container**: `#D3EEDF`
- **On Primary**: `#FFFFFF`
- **Brand Accent Blue**: `#0148E3` (Royal Blue)
- **Accent Blue Container**: `#E6EFFF`

### Dark Mode (`prefers-color-scheme: dark`)
- **Canvas / Background**: `#111412`
- **Surface**: `#191C1A`
- **Surface Variant**: `#232724`
- **Text Primary**: `#E1E3DF`
- **Text Secondary / Muted**: `#9CA39E`
- **Border / Outline**: `#363C38`
- **Brand Primary**: `#8CD8AC` (Mint Emerald)
- **Brand Primary Container**: `#145235`
- **On Primary**: `#003820`
- **Brand Accent Blue**: `#70A1FF`
- **Accent Blue Container**: `#0C2B68`

### Leaderboard Podium Tones
- **Gold (Rank 1)**: `#8A6D1F` (Light Container: `#F6ECD2`, Dark Container: `#3A3016`)
- **Silver (Rank 2)**: `#5F6B76` (Light Container: `#E8ECEF`, Dark Container: `#2C3238`)
- **Bronze (Rank 3)**: `#8A5A33` (Light Container: `#F1E2D3`, Dark Container: `#382718`)

---

## 4. Geometry & Elevation
- **Card Radius**: `16px` (`rounded-2xl`)
- **Container / Sheet Radius**: `24px` (`rounded-3xl`)
- **Pill Controls / Buttons**: `9999px` (`rounded-full`)
- **Elevation**:
  - Cards: `box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)` with hairline border `1px solid var(--border)`
  - Elevated Popovers / Sheets: `box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)`

---

## 5. Mobile Ergonomics
- **Touch Target**: Interactive elements maintain at least `44px x 44px` hitbox.
- **Thumb Zone**: Primary actions positioned within bottom 40% of viewport.
- **Bottom Navigation**: Floating pill navigation bar on mobile with icon + label (`Home`, `Read`, `Notes`, `Progress`, `Leaderboard`).
- **Sticky Cap**: Combined fixed headers and navbars do not exceed 15% of vertical viewport height.
