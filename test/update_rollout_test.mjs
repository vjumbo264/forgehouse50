import assert from 'assert';

console.log("=== Running Update Rollout Channel Tests ===");

function resolveUpdateForUser(role, releases) {
  const allowed = role === 'admin' ? ['admins_only', 'everyone'] : ['everyone'];
  const match = releases.find(r => allowed.includes(r.rollout_state));
  if (!match) return { update_available: false, message: 'No updates available for your channel.' };
  return { update_available: true, release: match };
}

const releases = [
  { version_code: 33, version_name: 'v33', rollout_state: 'admins_only' },
  { version_code: 32, version_name: 'v32', rollout_state: 'everyone' }
];

// Admin user gets v33 (admins_only)
const adminResult = resolveUpdateForUser('admin', releases);
assert.strictEqual(adminResult.update_available, true);
assert.strictEqual(adminResult.release.version_code, 33);
console.log("✓ Admin channel verified: receives v33 (admins_only)");

// Member user gets v32 (everyone), NOT v33
const memberResult = resolveUpdateForUser('member', releases);
assert.strictEqual(memberResult.update_available, true);
assert.strictEqual(memberResult.release.version_code, 32);
console.log("✓ Member channel verified: receives v32 (everyone), blocked from v33");

// If all releases are in 'hold':
const holdReleases = [
  { version_code: 34, version_name: 'v34', rollout_state: 'hold' }
];
assert.strictEqual(resolveUpdateForUser('admin', holdReleases).update_available, false);
assert.strictEqual(resolveUpdateForUser('member', holdReleases).update_available, false);
console.log("✓ Hold state verified: zero users receive update when on hold");

console.log("ALL UPDATE ROLLOUT TESTS PASSED!");
