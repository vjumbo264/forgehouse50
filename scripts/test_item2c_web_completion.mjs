import assert from 'assert';

console.log("=== Testing Item 2c: Website Active Timer & Completion Logic ===");

// 1. Logic simulation of web reader button state
function computeWebButtonState({ seconds, finalReached, isReview = false }) {
  const hasMin = seconds >= 300;
  const canComplete = isReview || (hasMin && finalReached);
  const remSec = Math.max(0, 300 - seconds);
  const helperText = isReview
    ? 'Review Mode'
    : !hasMin
    ? `Read for ${Math.floor(remSec / 60)}:${String(remSec % 60).padStart(2, '0')} more`
    : !finalReached
    ? 'Reach the last chapter to complete'
    : 'Ready to mark complete';
  const timerDisplay = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} / 5:00`;
  return { canComplete, helperText, timerDisplay };
}

// Case 1: At chapter 1, 0 seconds read -> disabled, helper = Read for 5:00 more
{
  const st = computeWebButtonState({ seconds: 0, finalReached: false });
  assert.strictEqual(st.canComplete, false);
  assert.strictEqual(st.helperText, 'Read for 5:00 more');
  assert.strictEqual(st.timerDisplay, '0:00 / 5:00');
  console.log("PASS: 0s at chapter 1 disabled with 'Read for 5:00 more'");
}

// Case 2: At last chapter, but only 200 seconds -> disabled, helper = Read for 1:40 more
{
  const st = computeWebButtonState({ seconds: 200, finalReached: true });
  assert.strictEqual(st.canComplete, false);
  assert.strictEqual(st.helperText, 'Read for 1:40 more');
  assert.strictEqual(st.timerDisplay, '3:20 / 5:00');
  console.log("PASS: 200s at last chapter disabled with 'Read for 1:40 more'");
}

// Case 3: 310 seconds read, but not at last chapter -> disabled, helper = Reach the last chapter to complete
{
  const st = computeWebButtonState({ seconds: 310, finalReached: false });
  assert.strictEqual(st.canComplete, false);
  assert.strictEqual(st.helperText, 'Reach the last chapter to complete');
  assert.strictEqual(st.timerDisplay, '5:10 / 5:00');
  console.log("PASS: 310s before last chapter disabled with 'Reach the last chapter to complete'");
}

// Case 4: 300 seconds and at last chapter -> enabled, helper = Ready to mark complete
{
  const st = computeWebButtonState({ seconds: 300, finalReached: true });
  assert.strictEqual(st.canComplete, true);
  assert.strictEqual(st.helperText, 'Ready to mark complete');
  assert.strictEqual(st.timerDisplay, '5:00 / 5:00');
  console.log("PASS: Exactly 300s at last chapter enabled with 'Ready to mark complete'");
}

// Case 5: Offline queue and sync simulation
{
  const localStorageMock = new Map();
  function enqueueOffline(completion) {
    const q = JSON.parse(localStorageMock.get('fh50_offline_completions') || '[]');
    q.push(completion);
    localStorageMock.set('fh50_offline_completions', JSON.stringify(q));
  }
  function syncOffline(mockApi) {
    const q = JSON.parse(localStorageMock.get('fh50_offline_completions') || '[]');
    const remaining = [];
    for (const item of q) {
      if (!mockApi(item)) remaining.push(item);
    }
    localStorageMock.set('fh50_offline_completions', JSON.stringify(remaining));
  }

  enqueueOffline({ dayNumber: 3, readingSeconds: 320, firstOpenedAt: '2026-10-15T09:00:00Z', finalChapterReached: true });
  assert.strictEqual(JSON.parse(localStorageMock.get('fh50_offline_completions')).length, 1);

  // Sync with API
  let synced = false;
  syncOffline((item) => {
    assert.strictEqual(item.dayNumber, 3);
    assert.strictEqual(item.readingSeconds, 320);
    synced = true;
    return true;
  });
  assert.strictEqual(synced, true);
  assert.strictEqual(JSON.parse(localStorageMock.get('fh50_offline_completions')).length, 0);
  console.log("PASS: Offline completion successfully queued and synced.");
}

console.log("ALL ITEM 2c TESTS PASSED!");
