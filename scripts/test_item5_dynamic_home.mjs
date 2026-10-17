import assert from "assert";

console.log("=== Testing Item 5 Dynamic Home Screen ===");

// 1. Contract: Defined priority order
const EXPECTED_PRIORITY_ORDER = [
  "update_card",
  "announcement_card",
  "today_reading_card",
  "community_card",
  "stats_row",
  "notes_action",
  "whatsapp_group",
  "support_play_store",
  "support_whatsapp",
  "admin_dashboard"
];

function resolveDynamicHomeOrder(state) {
  const cards = [];
  if (state.hasUpdate) cards.push("update_card");
  if (state.hasAnnouncement) cards.push("announcement_card");
  cards.push("today_reading_card");
  if (state.hasCommunityPost) cards.push("community_card");
  cards.push("stats_row");
  cards.push("notes_action");
  cards.push("whatsapp_group");
  cards.push("support_play_store");
  cards.push("support_whatsapp");
  if (state.isAdmin) cards.push("admin_dashboard");
  return cards;
}

// When all cards exist:
const allActive = resolveDynamicHomeOrder({
  hasUpdate: true,
  hasAnnouncement: true,
  hasCommunityPost: true,
  isAdmin: true
});
assert.deepStrictEqual(allActive, EXPECTED_PRIORITY_ORDER);
console.log("PASS: Defined priority order matches exact specification.");

// 2. Empty states render nothing
const emptyDynamic = resolveDynamicHomeOrder({
  hasUpdate: false,
  hasAnnouncement: false,
  hasCommunityPost: false,
  isAdmin: false
});
assert.strictEqual(emptyDynamic.includes("update_card"), false);
assert.strictEqual(emptyDynamic.includes("announcement_card"), false);
assert.strictEqual(emptyDynamic.includes("community_card"), false);
assert.strictEqual(emptyDynamic.includes("admin_dashboard"), false);
assert.strictEqual(emptyDynamic[0], "today_reading_card");
assert.strictEqual(emptyDynamic[1], "stats_row");
console.log("PASS: Empty states render nothing (no empty boxes).");

// 3. WAT timestamp formatting for Community post reply
function formatWatTime(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(d);
  return `Replied ${parts}`;
}

const replyTime = formatWatTime("2026-10-17T15:02:00.000Z");
assert.ok(replyTime.startsWith("Replied"));
assert.ok(replyTime.includes("17 Oct"));
assert.ok(replyTime.includes("4:02") || replyTime.includes("16:02"));
console.log(`PASS: WAT timestamp formatted correctly: "${replyTime}"`);

console.log("ALL ITEM 5 DYNAMIC HOME TESTS PASSED!");
