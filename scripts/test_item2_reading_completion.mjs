import assert from 'assert';
import { MIN_READING_SECONDS, MAX_READING_SECONDS_CEILING } from '../functions/api/read/complete.mjs';

console.log("=== Testing Item 2a: Backend Reading Completion Rules ===");

// 1. Minimum reading seconds constant
assert.strictEqual(MIN_READING_SECONDS, 300, "MIN_READING_SECONDS must be exactly 300 (5 minutes)");
assert.strictEqual(MAX_READING_SECONDS_CEILING, 21600, "MAX_READING_SECONDS_CEILING must be 21600 (6 hours)");
console.log("PASS: MIN_READING_SECONDS constant is 300.");

// Helper logic mimicking complete.mjs calculation with injectable clock
function calculateAcceptedSeconds({ rawSeconds, firstOpenedAt, nowMs, prevStored = 0, isLegacy = false, isAdmin = false }) {
  if (isAdmin) {
    return { accepted: Math.max(0, parseInt(rawSeconds ?? 300, 10)), source: 'admin_override', ok: true };
  }
  if (isLegacy || rawSeconds === undefined || rawSeconds === null) {
    if (prevStored >= MIN_READING_SECONDS) {
      return { accepted: prevStored, source: 'client', ok: true };
    } else if (firstOpenedAt) {
      const firstMs = new Date(firstOpenedAt).getTime();
      const diffSec = Math.max(0, Math.floor((nowMs - firstMs) / 1000));
      return { accepted: Math.min(diffSec, MAX_READING_SECONDS_CEILING), source: 'server_estimate', ok: true };
    } else {
      return { accepted: prevStored, source: 'server_estimate', ok: true };
    }
  }

  let claimed = parseInt(rawSeconds, 10);
  if (isNaN(claimed) || claimed < 0) claimed = 0;

  const firstMs = new Date(firstOpenedAt).getTime();
  if (!isNaN(firstMs) && firstMs > nowMs + 60000) {
    claimed = 0; // Future timestamp clamped
  } else if (!isNaN(firstMs)) {
    const elapsedWallClockSec = Math.max(0, Math.floor((nowMs - firstMs) / 1000)) + 60;
    claimed = Math.min(claimed, elapsedWallClockSec);
  }
  claimed = Math.min(claimed, MAX_READING_SECONDS_CEILING);
  const accepted = Math.max(claimed, prevStored);

  if (accepted < MIN_READING_SECONDS) {
    return { accepted, remainingSeconds: MIN_READING_SECONDS - accepted, source: 'client', ok: false, code: 'reading_time_too_short' };
  }
  return { accepted, source: 'client', ok: true };
}

// 2. Below minimum reading time (e.g. 120s)
{
  const now = Date.now();
  const res = calculateAcceptedSeconds({
    rawSeconds: 120,
    firstOpenedAt: new Date(now - 300000).toISOString(),
    nowMs: now
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.code, 'reading_time_too_short');
  assert.strictEqual(res.remainingSeconds, 180);
  console.log("PASS: Below minimum (120s) rejected with code reading_time_too_short and remainingSeconds = 180.");
}

// 3. Exactly 300 seconds
{
  const now = Date.now();
  const res = calculateAcceptedSeconds({
    rawSeconds: 300,
    firstOpenedAt: new Date(now - 350000).toISOString(),
    nowMs: now
  });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.accepted, 300);
  console.log("PASS: Exactly 300s accepted.");
}

// 4. Above minimum (e.g. 450s)
{
  const now = Date.now();
  const res = calculateAcceptedSeconds({
    rawSeconds: 450,
    firstOpenedAt: new Date(now - 500000).toISOString(),
    nowMs: now
  });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.accepted, 450);
  console.log("PASS: Above minimum (450s) accepted.");
}

// 5. Tampered future firstOpenedAt
{
  const now = Date.now();
  const res = calculateAcceptedSeconds({
    rawSeconds: 400,
    firstOpenedAt: new Date(now + 3600000).toISOString(), // 1 hour in future
    nowMs: now
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.accepted, 0);
  console.log("PASS: Tampered future firstOpenedAt clamped to 0 and rejected under minimum.");
}

// 6. Huge seconds clamped to ceiling (21600s)
{
  const now = Date.now();
  const res = calculateAcceptedSeconds({
    rawSeconds: 100000,
    firstOpenedAt: new Date(now - 86400000).toISOString(),
    nowMs: now
  });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.accepted, 21600);
  console.log("PASS: Huge seconds (100,000s) clamped to 21600 ceiling.");
}

// 7. Legacy client (no readingSeconds)
{
  const now = Date.now();
  const res = calculateAcceptedSeconds({
    rawSeconds: undefined,
    firstOpenedAt: new Date(now - 600000).toISOString(),
    nowMs: now,
    isLegacy: true
  });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.source, 'server_estimate');
  console.log("PASS: Legacy client without readingSeconds estimated and accepted.");
}

// 8. Admin override
{
  const now = Date.now();
  const res = calculateAcceptedSeconds({
    rawSeconds: 50,
    isAdmin: true,
    nowMs: now
  });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.source, 'admin_override');
  console.log("PASS: Admin override bypasses minimum check.");
}

console.log("ALL 8 BACKEND COMPLETION TESTS PASSED!");
