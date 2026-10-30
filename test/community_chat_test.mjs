import assert from 'assert';

console.log("=== Running Community Chat & Permissions Tests ===");

// Test 1: Verify direct thread access control logic
function checkDirectThreadAccess(user, requestedThreadId) {
  if (user.role === 'admin') return { allowed: true, targetId: requestedThreadId || user.id };
  if (requestedThreadId && requestedThreadId !== user.id) {
    return { allowed: false, error: "Members cannot access other members' private threads." };
  }
  return { allowed: true, targetId: user.id };
}

const member1 = { id: 'usr_alice', role: 'member', name: 'Alice' };
const member2 = { id: 'usr_bob', role: 'member', name: 'Bob' };
const admin = { id: 'usr_pastor', role: 'admin', name: 'Pastor Dave' };

// Alice accessing own thread -> allowed
assert.strictEqual(checkDirectThreadAccess(member1, 'usr_alice').allowed, true);

// Alice attempting to access Bob's private thread -> FORBIDDEN
const accessBob = checkDirectThreadAccess(member1, 'usr_bob');
assert.strictEqual(accessBob.allowed, false);
assert.strictEqual(accessBob.error, "Members cannot access other members' private threads.");
console.log("✓ Member permission verified: Alice cannot access Bob's private thread.");

// Admin accessing Bob's private thread -> ALLOWED
assert.strictEqual(checkDirectThreadAccess(admin, 'usr_bob').allowed, true);
console.log("✓ Admin permission verified: Pastor Dave can access Bob's thread.");

// Test 2: Mute permission check
function canPostMessage(isMuted) {
  if (isMuted) return { allowed: false, error: 'You are currently muted from posting messages.' };
  return { allowed: true };
}

assert.strictEqual(canPostMessage(false).allowed, true);
const mutedCheck = canPostMessage(true);
assert.strictEqual(mutedCheck.allowed, false);
assert.strictEqual(mutedCheck.error, 'You are currently muted from posting messages.');
console.log("✓ Mute rule verified: muted members are blocked from posting.");

// Test 3: Author name privacy (name + surname initial only; no email/phone)
function formatAuthorName(name, surname) {
  const given = (name || '').trim();
  const sur = (surname || '').trim();
  if (given && sur) return `${given} ${sur[0].toUpperCase()}.`;
  return given || 'Member';
}

assert.strictEqual(formatAuthorName('David', 'Oyedepo'), 'David O.');
assert.strictEqual(formatAuthorName('Victor', 'Jumbo'), 'Victor J.');
assert.strictEqual(formatAuthorName('Mary', ''), 'Mary');
console.log("✓ Author formatting verified: only given name + surname initial exposed.");

console.log("ALL COMMUNITY CHAT PERMISSIONS TESTS PASSED!");
