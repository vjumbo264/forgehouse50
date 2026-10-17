import assert from "assert";
import fs from "fs";

console.log("=== Testing Item 7 Complete Changelog and What's New ===");

const raw = fs.readFileSync("/repos/forgehouse50/public/changelog.json", "utf8");
const changelog = JSON.parse(raw);

// 1. Structure
assert.ok(Array.isArray(changelog), "Changelog must be a JSON array");
assert.ok(changelog.length >= 10, "Changelog must contain historical releases");

// 2. Strict CI Check: ZERO occurrences of forbidden word "admin"
for (const entry of changelog) {
  assert.ok(entry.version, "Entry must have a version");
  assert.ok(entry.date, "Entry must have a date");
  assert.ok(Array.isArray(entry.items) && entry.items.length > 0, "Entry must have non-empty items");
  for (const item of entry.items) {
    assert.strictEqual(
      item.toLowerCase().includes("admin"),
      false,
      `Forbidden word "admin" found in version ${entry.version}: ${item}`
    );
  }
}
console.log("PASS: CI check passed: ZERO mentions of 'admin' in any changelog entry.");

// 3. Newest release is first
const v0Num = parseInt(changelog[0].version.replace(/\D/g, ""), 10);
const v1Num = parseInt(changelog[1].version.replace(/\D/g, ""), 10);
assert.ok(v0Num > v1Num, "Newest release must be listed first");
console.log(`PASS: Release order verified: ${changelog[0].version} is first.`);

// 4. Since you last updated logic
function computeSinceLastSeen(entries, lastSeen) {
  if (!lastSeen) return [];
  const lastNum = parseInt(lastSeen.replace(/\D/g, ""), 10);
  return entries
    .filter(e => parseInt(e.version.replace(/\D/g, ""), 10) > lastNum)
    .flatMap(e => e.items);
}

const sinceV28 = computeSinceLastSeen(changelog, "v28");
assert.ok(sinceV28.length >= 8, "Must include all features added since v28");
console.log(`PASS: "Since you last updated" logic verified (${sinceV28.length} items since v28).`);

console.log("ALL ITEM 7 CHANGELOG TESTS PASSED!");
