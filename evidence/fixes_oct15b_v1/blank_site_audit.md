# ForgeHouse 50 — Blank Website Audit (Item 1)
Date: 2026-10-15
Investigator: ForgeHouse Builder AI

## 1. Live Diagnosis
- Production URL: `https://forgehouse50.pages.dev/` and `https://forgehouse50.pages.dev/app/`
- Tool used: Playwright (Chromium 1247, headless, mobile viewport 390x844)
- Live HTTP Status:
  * `/` -> 200 OK (text/html)
  * `/app/` -> 200 OK (text/html)
  * `/assets/index-CQfSSHWX.js` -> 200 OK (application/javascript)
  * `/assets/index-D8tlLa-P.css` -> 200 OK (text/css)
- Live Browser Console / Page Error:
  `[PAGE ERROR]: Unexpected template string`
  `Root innerHTML length: 0`
  The root container `<div id="root"></div>` was completely empty on both routes.

## 2. Cloudflare Pages Status
- Cloudflare Pages Project ID: `2d0263ec-694a-46ca-b32e-fff93af2948f`
- Production Branch: `main`
- Latest Deployed Canonical Deployment: `53090e61-2206-400f-9a6e-721052496b9a`
- Deployed Commit: `82288af91c4834b2f60548dc7093bcf699ccca15` (Item 7c/7d web profile pictures)

## 3. Root Cause Analysis
- During commit `82288af`, profile picture upload code was added to `public/assets/index-CQfSSHWX.js`.
- The code contained uncomputed template literal object keys:
  * `headers: { `Content-Type`: blob.type }`
  * `headers: { `Content-Type`: `application/json` }`
- In ECMAScript syntax, object property keys cannot be raw template literals (`` `key`: value ``); they must either be identifiers, string literals (`"key": value`), or computed properties (`[`key`]: value`).
- When browsers (Chromium, Safari, Firefox) loaded `index-CQfSSHWX.js`, parsing failed immediately with:
  `SyntaxError: Unexpected template string`
- As a result, the JavaScript engine aborted execution of the module before React or any components could initialize or render into `#root`.
- In incognito tabs, the error persisted because the served script itself had the syntax error.
- Devices with an older service worker cache retained the previous working bundle, creating an apparent split between "frozen old site" on cached devices and "blank screen" on fresh/uncached devices.

## 4. Remediation Plan
1. Fix the syntax error in `public/assets/index-CQfSSHWX.js` by converting template literal keys to valid string literal keys (`"Content-Type": ...`).
2. Verify module syntax validity with `node --check` and `esbuild`.
3. Implement self-healing service worker `sw.js` (bumped to `fh50-v2-09`):
   - Strict content-type and status check on cached `/assets/*`
   - Network-first navigation with clean fallback
4. Add Inline Boot Guard in `index.html` and `public/app/index.html`:
   - 8-second mount watchdog + `window.addEventListener('error')` script error handler
   - Automatic cache storage clearing + service worker unregistration + one-time reload
   - Graceful fallback UI with manual "Tap to retry" button if reload fails
5. Add `/sw-reset.html` standalone emergency reset page.
6. Remove orphaned old asset bundles (`index-BbGOuGhU.js`, `index-BjahG9wB.js`, `index-De_AtA14.css`) from `public/assets/`.
7. Add post-deploy smoke test to verify `#root` contains rendered UI in CI.
