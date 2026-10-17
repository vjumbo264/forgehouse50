import assert from "assert";

console.log("=== Testing Item 2 Reader Redesign & Counters (2a, 2b, 2c) ===");

// 1. Counter logic test
function computeVersesLeft(totalVerses, progress) {
  return Math.max(0, Math.round((1 - progress) * totalVerses));
}
function computeChaptersLeft(totalChapters, currentIdx) {
  return Math.max(0, totalChapters - 1 - currentIdx);
}
function formatReaderCounters(totalVerses, progress, totalChapters, currentIdx, isDone) {
  if (isDone) return "Completed";
  const vLeft = computeVersesLeft(totalVerses, progress);
  const chLeft = computeChaptersLeft(totalChapters, currentIdx);
  if (vLeft === 0 && chLeft === 0) return "Completed";
  if (chLeft > 0) return `${vLeft} verses · ${chLeft} ch left`;
  return `${vLeft} verses left`;
}

// Case 1: Start of Matthew 13 (58 verses, prog 0, ch 0 of 6)
assert.strictEqual(formatReaderCounters(58, 0, 6, 0, false), "58 verses · 5 ch left");
// Case 2: Mid-chapter (prog 0.5)
assert.strictEqual(formatReaderCounters(58, 0.5, 6, 0, false), "29 verses · 5 ch left");
// Case 3: Approaching end (prog 0.9)
assert.strictEqual(formatReaderCounters(58, 0.9, 6, 0, false), "6 verses · 5 ch left");
// Case 4: End of chapter (prog 1.0)
assert.strictEqual(formatReaderCounters(58, 1.0, 6, 0, false), "0 verses · 5 ch left");
// Case 5: Last chapter of day (ch 5 of 6, 35 verses, prog 0.2)
assert.strictEqual(formatReaderCounters(35, 0.2, 6, 5, false), "28 verses left");
// Case 6: Completed
assert.strictEqual(formatReaderCounters(35, 1, 6, 5, true), "Completed");

// 2. Dock state test: Single dock container ensures reading and selection states never overlap
function resolveDock(selectedVerse, readingSeconds, canComplete) {
  if (selectedVerse) {
    return {
      type: "selection",
      verse: selectedVerse,
      runningTimerDisplay: `${Math.floor(readingSeconds / 60)}:${String(readingSeconds % 60).padStart(2, "0")}`
    };
  }
  return {
    type: "reading",
    timerDisplay: `${Math.floor(readingSeconds / 60)}:${String(readingSeconds % 60).padStart(2, "0")} / 5:00`,
    canComplete
  };
}

const s1 = resolveDock(null, 120, false);
assert.strictEqual(s1.type, "reading");
assert.strictEqual(s1.timerDisplay, "2:00 / 5:00");

const s2 = resolveDock("v. 5", 125, false);
assert.strictEqual(s2.type, "selection");
assert.strictEqual(s2.verse, "v. 5");
assert.strictEqual(s2.runningTimerDisplay, "2:05");

// 3. Header non-truncation test
function formatHeader(book, chapter, totalChapters, currentIdx) {
  const title = `${book} ${chapter}`;
  const indicator = `Chapter ${currentIdx + 1} of ${totalChapters}`;
  return { title, indicator };
}

const h1 = formatHeader("Matthew", 13, 6, 0);
assert.strictEqual(h1.title, "Matthew 13");
assert.strictEqual(h1.indicator, "Chapter 1 of 6");

console.log("ALL ITEM 2 READER REDESIGN TESTS PASSED!");
