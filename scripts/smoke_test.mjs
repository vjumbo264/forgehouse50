import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = path.resolve(__dirname, '..', 'evidence', 'fixes_oct15b_v1');
if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });

const TARGET_URL = process.env.TEST_URL || 'https://forgehouse50.pages.dev';

async function runSmokeTest() {
  console.log(`Running smoke test against: ${TARGET_URL}`);
  
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  let fatalErrors = 0;

  // 1. Fresh profile mobile test
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error(`[CONSOLE ERROR]:`, msg.text());
      // Fail on unhandled JS error
      if (!msg.text().includes('favicon') && !msg.text().includes('404') && !msg.text().includes('401') && !msg.text().includes('403')) {
        fatalErrors++;
      }
    }
  });

  page.on('pageerror', err => {
    console.error(`[PAGE FATAL ERROR]:`, err.message);
    fatalErrors++;
  });

  page.on('requestfailed', req => {
    console.warn(`[REQ FAILED]:`, req.url(), req.failure()?.errorText);
    if (req.url().includes('/assets/')) {
      fatalErrors++;
    }
  });

  console.log(`\n1. Testing landing route: ${TARGET_URL}/`);
  const landingRes = await page.goto(`${TARGET_URL}/`, { waitUntil: 'networkidle', timeout: 30000 });
  console.log(`Landing HTTP status: ${landingRes?.status()}`);
  if (landingRes?.status() >= 400) {
    console.error(`Landing HTTP status failure: ${landingRes?.status()}`);
    fatalErrors++;
  }

  await page.waitForTimeout(2000);
  const landingRoot = await page.$eval('#root', el => el.innerHTML).catch(() => '');
  console.log(`Landing root innerHTML length: ${landingRoot.length}`);
  if (landingRoot.length < 200) {
    console.error(`Landing root is blank or too short!`);
    fatalErrors++;
  }

  const landingText = await page.innerText('body');
  if (!landingText.includes('ForgeHouse 50')) {
    console.error(`Landing page missing 'ForgeHouse 50' title text!`);
    fatalErrors++;
  }
  await page.screenshot({ path: path.join(evidenceDir, 'smoke_landing.png') });

  console.log(`\n2. Testing app route: ${TARGET_URL}/app/`);
  const appRes = await page.goto(`${TARGET_URL}/app/`, { waitUntil: 'networkidle', timeout: 30000 });
  console.log(`App HTTP status: ${appRes?.status()}`);
  if (appRes?.status() >= 400) {
    console.error(`App HTTP status failure: ${appRes?.status()}`);
    fatalErrors++;
  }

  await page.waitForTimeout(2000);
  const appRoot = await page.$eval('#root', el => el.innerHTML).catch(() => '');
  console.log(`App root innerHTML length: ${appRoot.length}`);
  if (appRoot.length < 200) {
    console.error(`App root is blank or too short!`);
    fatalErrors++;
  }
  await page.screenshot({ path: path.join(evidenceDir, 'smoke_app.png') });

  // 3. Stale cache simulation test
  console.log(`\n3. Testing stale cache recovery...`);
  // Open sw-reset to simulate recovery
  await page.goto(`${TARGET_URL}/sw-reset.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const resetStatus = await page.$eval('#status', el => el.textContent).catch(() => '');
  console.log(`sw-reset status: ${resetStatus}`);
  await page.screenshot({ path: path.join(evidenceDir, 'smoke_stale_recovery.png') });

  await browser.close();

  if (fatalErrors > 0) {
    console.error(`\nSmoke test FAILED with ${fatalErrors} fatal error(s)!`);
    process.exit(1);
  } else {
    console.log(`\nSmoke test PASSED with 0 errors!`);
  }
}

runSmokeTest().catch(err => {
  console.error("Smoke test unhandled exception:", err);
  process.exit(1);
});
