import assert from "assert";

console.log("=== Testing Item 4 Notes Policy & Timestamps (4a, 4b, 4c) ===");

// 1. Leader-bound vs Private Types Policy
const LEADER_TYPES = ['observation', 'question', 'prayer', 'application'];
const PRIVATE_TYPES = ['insight', 'scripture_connection'];

function isSentToLeaders(type) {
  return LEADER_TYPES.includes(type.toLowerCase());
}

assert.strictEqual(isSentToLeaders('observation'), true);
assert.strictEqual(isSentToLeaders('question'), true);
assert.strictEqual(isSentToLeaders('prayer'), true);
assert.strictEqual(isSentToLeaders('application'), true);
assert.strictEqual(isSentToLeaders('insight'), false);
assert.strictEqual(isSentToLeaders('scripture_connection'), false);
console.log("PASS: Leader-bound types and private Insight policy verified.");

// 2. Publish Gate: Prayer & Application require allow_group_share = 1
function canPublishToCommunity(item, hasLeaderReply) {
  if (!hasLeaderReply) return { allowed: false, error: "Reply required" };
  if ((item.type === 'prayer' || item.type === 'application') && !item.allow_group_share) {
    return { allowed: false, error: "Cannot publish without author permission" };
  }
  return { allowed: true };
}

// Observation without reply -> cannot publish
assert.strictEqual(canPublishToCommunity({ type: 'observation', allow_group_share: false }, false).allowed, false);
// Observation with reply -> can publish
assert.strictEqual(canPublishToCommunity({ type: 'observation', allow_group_share: false }, true).allowed, true);

// Prayer with reply but allow_group_share = false -> BLOCKED
assert.strictEqual(canPublishToCommunity({ type: 'prayer', allow_group_share: false }, true).allowed, false);
// Prayer with reply and allow_group_share = true -> ALLOWED
assert.strictEqual(canPublishToCommunity({ type: 'prayer', allow_group_share: true }, true).allowed, true);

// Application with reply but allow_group_share = false -> BLOCKED
assert.strictEqual(canPublishToCommunity({ type: 'application', allow_group_share: false }, true).allowed, false);
// Application with reply and allow_group_share = true -> ALLOWED
assert.strictEqual(canPublishToCommunity({ type: 'application', allow_group_share: true }, true).allowed, true);
console.log("PASS: Community publish permission gate verified.");

// 3. WAT Time Formatter Test (UTC+1, no DST in Africa/Lagos)
function formatWatTime(isoString, includeYear = false) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";

  // WAT is UTC+1: add 1 hour
  const watMs = d.getTime() + 3600000;
  const wat = new Date(watMs);

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = wat.getUTCDate();
  const month = months[wat.getUTCMonth()];
  const year = wat.getUTCFullYear();
  let hours = wat.getUTCHours();
  const minutes = String(wat.getUTCMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12;

  return includeYear
    ? `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`
    : `${day} ${month}, ${hours}:${minutes} ${ampm}`;
}

// 12:15 UTC is 13:15 (1:15 pm) WAT on 17 Oct 2026
const formatted1 = formatWatTime("2026-10-17T12:15:00.000Z");
assert.strictEqual(formatted1, "17 Oct, 1:15 pm");

// 15:02 UTC is 16:02 (4:02 pm) WAT on 17 Oct 2026
const formatted2 = formatWatTime("2026-10-17T15:02:00.000Z");
assert.strictEqual(formatted2, "17 Oct, 4:02 pm");

// With year
const formattedWithYear = formatWatTime("2026-10-17T12:15:00.000Z", true);
assert.strictEqual(formattedWithYear, "17 Oct 2026, 1:15 pm");

console.log("PASS: WAT (UTC+1) timestamps formatting verified.");
console.log("ALL ITEM 4 NOTES POLICY & TIMESTAMP TESTS PASSED!");
