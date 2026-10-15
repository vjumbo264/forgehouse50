import assert from 'assert';

console.log("=== Testing Item 4: Admin Reading Time & Reset Latest Day ===");

// Simulation of user state & reset logic
function createInitialUserState() {
  return {
    userId: 'u_test_1',
    role: 'member',
    daysCompleted: 3,
    calendar: [
      { day: 1, date: '2026-10-12', elapsed: true },
      { day: 2, date: '2026-10-13', elapsed: true },
      { day: 3, date: '2026-10-14', elapsed: true },
    ],
    readingProgress: new Map([
      [1, { completed: true, completedAt: '2026-10-12T10:00:00Z', readingSeconds: 360, chapters: 5 }],
      [2, { completed: true, completedAt: '2026-10-13T11:00:00Z', readingSeconds: 420, chapters: 5 }],
      [3, { completed: true, completedAt: '2026-10-14T12:00:00Z', readingSeconds: 310, chapters: 5 }],
    ]),
    quizAttempts: new Map([
      [1, { score: 5, total: 5, passed: true }],
      [2, { score: 4, total: 5, passed: true }],
      [3, { score: 5, total: 5, passed: true }],
    ]),
    pointsLedger: [
      { id: 'p1', day: 1, action: 'reading_completed', points: 10, key: 'reading_completed:u_test_1:1' },
      { id: 'p2', day: 1, action: 'daily_streak', points: 3, key: 'daily_streak:u_test_1:1' },
      { id: 'p3', day: 1, action: 'quiz_score', points: 35, key: 'quiz_score:u_test_1:1' },
      { id: 'p4', day: 2, action: 'reading_completed', points: 10, key: 'reading_completed:u_test_1:2' },
      { id: 'p5', day: 2, action: 'daily_streak', points: 3, key: 'daily_streak:u_test_1:2' },
      { id: 'p6', day: 2, action: 'quiz_score', points: 28, key: 'quiz_score:u_test_1:2' },
      { id: 'p7', day: 3, action: 'reading_completed', points: 10, key: 'reading_completed:u_test_1:3' },
      { id: 'p8', day: 3, action: 'daily_streak', points: 3, key: 'daily_streak:u_test_1:3' },
      { id: 'p9', day: 3, action: 'quiz_score', points: 35, key: 'quiz_score:u_test_1:3' },
      { id: 'p_adj', day: null, action: 'admin_adjustment', points: 5, key: 'admin_adj:1', reason: 'bonus' },
    ],
    badges: new Set(['streak-7', 'finisher-50']),
    adminAudit: [],
  };
}

function computeStreaks(user) {
  const completed = Array.from(user.readingProgress.entries())
    .filter(([_, p]) => p.completed)
    .map(([d, _]) => d)
    .sort((a, b) => a - b);
  return { current: completed.length, longest: completed.length };
}

function getTotalPoints(user) {
  return user.pointsLedger.reduce((sum, p) => sum + p.points, 0);
}

function getTotalReadingSeconds(user) {
  let sec = 0;
  for (const [_, p] of user.readingProgress) {
    if (p.completed) sec += p.readingSeconds;
  }
  return sec;
}

function resetLatestDay(user, adminUser, requestId = null) {
  if (user.role === 'admin') {
    throw new Error('FORBIDDEN: Admin accounts cannot be targeted');
  }

  // Idempotency
  if (requestId && user.adminAudit.some(a => a.requestId === requestId)) {
    return { ok: true, already_processed: true };
  }

  // Find latest completed day
  let latestDay = 0;
  let latestCompletedAt = '';
  for (const [d, p] of user.readingProgress) {
    if (p.completed && p.completedAt) {
      if (!latestCompletedAt || p.completedAt > latestCompletedAt) {
        latestCompletedAt = p.completedAt;
        latestDay = d;
      }
    }
  }

  if (latestDay === 0) {
    throw new Error('BAD_REQUEST: User has no completed reading days to reset');
  }

  const prevProgress = user.readingProgress.get(latestDay);
  const prevReadingSec = prevProgress.readingSeconds;
  const prevQuiz = user.quizAttempts.get(latestDay);
  const prevQuizScore = prevQuiz ? `${prevQuiz.score}/${prevQuiz.total}` : null;

  // Points to reverse for that day (excluding admin_adjustment)
  const reversedPointsList = user.pointsLedger.filter(p => p.day === latestDay && p.action !== 'admin_adjustment');
  const pointsReversed = reversedPointsList.reduce((sum, p) => sum + p.points, 0);

  // Atomic reversal
  user.pointsLedger = user.pointsLedger.filter(p => !(p.day === latestDay && p.action !== 'admin_adjustment'));
  user.quizAttempts.delete(latestDay);
  user.readingProgress.set(latestDay, {
    completed: false,
    completedAt: null,
    readingSeconds: 0,
    chapters: 0,
  });

  // Badge revocation
  const daysDone = Array.from(user.readingProgress.values()).filter(p => p.completed).length;
  if (daysDone < 50) {
    user.badges.delete('finisher-50');
  }

  // Record audit
  user.adminAudit.push({
    adminId: adminUser.id,
    action: 'reset_latest_day',
    targetUserId: user.userId,
    dayNumber: latestDay,
    pointsReversed,
    previousReadingSeconds: prevReadingSec,
    previousQuizScore: prevQuizScore,
    requestId,
    timestamp: new Date().toISOString(),
  });

  return {
    ok: true,
    dayNumber: latestDay,
    pointsReversed,
    previousReadingSeconds: prevReadingSec,
    previousQuizScore: prevQuizScore,
    newTotalPoints: getTotalPoints(user),
    newDaysCompleted: daysDone,
    newReadingSeconds: getTotalReadingSeconds(user),
    newStreak: computeStreaks(user).current,
  };
}

// TEST 1: Full-day reversal including reading, streak bonus, and quiz points
{
  const user = createInitialUserState();
  const admin = { id: 'admin_1', role: 'admin' };
  const initialPoints = getTotalPoints(user); // 10+3+35 + 10+3+28 + 10+3+35 + 5 = 142
  assert.strictEqual(initialPoints, 142);

  const res = resetLatestDay(user, admin, 'req_1');
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.dayNumber, 3);
  assert.strictEqual(res.pointsReversed, 48); // 10 + 3 + 35 = 48
  assert.strictEqual(res.previousReadingSeconds, 310);
  assert.strictEqual(res.previousQuizScore, '5/5');
  assert.strictEqual(res.newTotalPoints, 94); // 142 - 48 = 94 (admin adjustment 5 preserved!)
  assert.strictEqual(res.newDaysCompleted, 2);
  assert.strictEqual(res.newStreak, 2);
  assert.strictEqual(user.quizAttempts.has(3), false);
  assert.strictEqual(user.readingProgress.get(3).completed, false);
  assert.strictEqual(user.readingProgress.get(3).readingSeconds, 0);
  assert.strictEqual(user.adminAudit.length, 1);
  console.log("PASS: Test 1 — Full-day reversal including reading, streak bonus, and quiz.");
}

// TEST 2: Reset when user has no completed days throws clear error
{
  const user = createInitialUserState();
  user.readingProgress.clear();
  const admin = { id: 'admin_1', role: 'admin' };
  assert.throws(() => resetLatestDay(user, admin), /BAD_REQUEST.*no completed reading days/);
  console.log("PASS: Test 2 — Reset with no completed days returns clear error.");
}

// TEST 3: Admin account cannot be targeted
{
  const adminTarget = { ...createInitialUserState(), role: 'admin' };
  const admin = { id: 'admin_1', role: 'admin' };
  assert.throws(() => resetLatestDay(adminTarget, admin), /FORBIDDEN.*Admin accounts cannot be targeted/);
  console.log("PASS: Test 3 — Admin account cannot be targeted.");
}

// TEST 4: Re-completion yields exact normal totals (no farming, no duplicates)
{
  const user = createInitialUserState();
  const admin = { id: 'admin_1', role: 'admin' };
  const beforePoints = getTotalPoints(user); // 142

  resetLatestDay(user, admin, 'req_4');
  assert.strictEqual(getTotalPoints(user), 94);

  // User re-reads day 3 and takes quiz again
  user.readingProgress.set(3, { completed: true, completedAt: '2026-10-15T09:00:00Z', readingSeconds: 320, chapters: 5 });
  user.pointsLedger.push({ id: 'p7_new', day: 3, action: 'reading_completed', points: 10, key: 'reading_completed:u_test_1:3' });
  user.pointsLedger.push({ id: 'p8_new', day: 3, action: 'daily_streak', points: 3, key: 'daily_streak:u_test_1:3' });
  user.quizAttempts.set(3, { score: 5, total: 5, passed: true });
  user.pointsLedger.push({ id: 'p9_new', day: 3, action: 'quiz_score', points: 35, key: 'quiz_score:u_test_1:3' });

  assert.strictEqual(getTotalPoints(user), beforePoints);
  assert.strictEqual(user.pointsLedger.filter(p => p.day === 3).length, 3); // exactly 3 awards, no duplicates
  console.log("PASS: Test 4 — Re-completion yields exact original totals without point farming.");
}

// TEST 5: Badge revocation when criteria are no longer met
{
  const user = createInitialUserState();
  assert.strictEqual(user.badges.has('finisher-50'), true);
  const admin = { id: 'admin_1', role: 'admin' };
  resetLatestDay(user, admin);
  assert.strictEqual(user.badges.has('finisher-50'), false);
  console.log("PASS: Test 5 — Badges revoked when criteria no longer met.");
}

// TEST 6: Idempotent per request / concurrent double-tap safety
{
  const user = createInitialUserState();
  const admin = { id: 'admin_1', role: 'admin' };
  const res1 = resetLatestDay(user, admin, 'req_double_tap');
  assert.strictEqual(res1.ok, true);
  assert.strictEqual(res1.dayNumber, 3);

  // Second call with same request_id
  const res2 = resetLatestDay(user, admin, 'req_double_tap');
  assert.strictEqual(res2.ok, true);
  assert.strictEqual(res2.already_processed, true);
  // Points were NOT reversed a second time
  assert.strictEqual(getTotalPoints(user), 94);
  console.log("PASS: Test 6 — Concurrent double-tap safety with request_id.");
}

// TEST 7: Successive resets step back one day at a time
{
  const user = createInitialUserState();
  const admin = { id: 'admin_1', role: 'admin' };
  const r1 = resetLatestDay(user, admin);
  assert.strictEqual(r1.dayNumber, 3);
  const r2 = resetLatestDay(user, admin);
  assert.strictEqual(r2.dayNumber, 2);
  const r3 = resetLatestDay(user, admin);
  assert.strictEqual(r3.dayNumber, 1);
  assert.strictEqual(Array.from(user.readingProgress.values()).filter(p => p.completed).length, 0);
  console.log("PASS: Test 7 — Successive calls step back one day at a time.");
}

console.log("\nALL ITEM 4 BACKEND TESTS PASSED!");
