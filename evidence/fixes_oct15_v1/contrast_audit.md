# ForgeHouse 50 — Contrast Audit & Design Tokens (Item 3)

## 1. Problem Diagnosed
- **Issue**: In light mode, the selected mobile floating navigation tab's label and icon were rendered with `text-white` on top of an unstyled/missing background class (`bg-[#1D6460]` was not present in the CSS build), causing the selected pill to inherit the container's near-white `#E6EFE9` background.
- **Resulting contrast**: `#FFFFFF` on `#E6EFE9` = 1.15:1 (unreadable white-on-near-white).
- **Secondary issue**: Gold badge `#8A6D1F` on `#F6ECD2` container was 4.16:1 (under WCAG AA 4.5:1).

## 2. Remediated Tokens (Matching Android App M3 Theme)
- **Light Theme**:
  - Container (`surfaceContainer`): `#E6EFE9`
  - Selected Pill Background (`primary`): `#2E6B4F`
  - Selected Text & Icon (`onPrimary`): `#FFFFFF` (Contrast: **6.30:1** — WCAG AA pass)
  - Unselected Icon (`onSurfaceVariant`): `#414942` (Contrast: **7.93:1** — WCAG AAA pass)
- **Dark Theme**:
  - Container (`surfaceContainer`): `#192420`
  - Selected Pill Background (`primary`): `#8CD8AC`
  - Selected Text & Icon (`onPrimary`): `#003820` (Contrast: **7.90:1** — WCAG AAA pass)
  - Unselected Icon (`onSurfaceVariant`): `#C1C9C0` (Contrast: **9.42:1** — WCAG AAA pass)
- **Desktop Navigation**:
  - Light: `#2E6B4F` on `#D3EEDF` (Contrast: **5.12:1** — WCAG AA pass)
  - Dark: `#8CD8AC` on `#145235` (Contrast: **5.48:1** — WCAG AA pass)
- **Badges**:
  - Light Gold Badge: updated to `#785D15` on `#F6ECD2` (Contrast: **5.29:1** — WCAG AA pass)
  - Dark Gold Badge: `#EBBF8A` on `#3A3016` (Contrast: **7.65:1** — WCAG AAA pass)
  - Light Silver Badge: `#5F6B76` on `#E8ECEF` (Contrast: **4.59:1** — WCAG AA pass)
  - Dark Silver Badge: `#E8ECEF` on `#2C3238` (Contrast: **10.91:1** — WCAG AAA pass)

## 3. Automated Validation
Run via `node scripts/test_contrast_item3.mjs`:
All 16 surfaces pass WCAG AA >= 4.5:1.
Service Worker cache bumped to `fh50-v2-05`.
