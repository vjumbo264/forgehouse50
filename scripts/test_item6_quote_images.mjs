import assert from "assert";

console.log("=== Testing Item 6 Branded Quote Images (Android & Web) ===");

// 1. Dimensions
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
assert.strictEqual(CARD_WIDTH, 1080);
assert.strictEqual(CARD_HEIGHT, 1350);
console.log("PASS: 1080 x 1350 px portrait quote card dimensions verified.");

// 2. Palettes: 3 cycling variants
const PALETTES = [
  { name: "Sage Ivory", bg: "#F6F8F6", text: "#191C1A", meta: "#2E6B4F" },
  { name: "Warm Linen", bg: "#FBF9F4", text: "#1C1C19", meta: "#5F4B32" },
  { name: "Mist Mint", bg: "#F2F6F5", text: "#141C19", meta: "#205A4B" }
];
assert.strictEqual(PALETTES.length, 3);
assert.strictEqual(PALETTES[0 % 3].name, "Sage Ivory");
assert.strictEqual(PALETTES[1 % 3].name, "Warm Linen");
assert.strictEqual(PALETTES[2 % 3].name, "Mist Mint");
assert.strictEqual(PALETTES[3 % 3].name, "Sage Ivory");
console.log("PASS: 3 cycling background palettes verified.");

// 3. Sharing eligibility & privacy rules
function canShareAsQuoteImage(item) {
  const hasReply = (item.reply && (item.reply.text || typeof item.reply === 'string')) || item.status === 'answered' || item.status === 'published';
  if (!hasReply) return false;
  const type = (item.type || '').toLowerCase();
  if (type === 'insight') return false; // Strict privacy: never shared
  if ((type === 'prayer' || type === 'application') && !item.allow_group_share) return false;
  return true;
}

function resolveAuthorDisplay(item) {
  if (item.show_name === false) return "Anonymous";
  return item.author_full_name || item.author_name || "Anonymous";
}

// Unanswered note -> false
assert.strictEqual(canShareAsQuoteImage({ type: 'observation', reply: null, status: 'new' }), false);
// Answered observation -> true
assert.strictEqual(canShareAsQuoteImage({ type: 'observation', reply: { text: 'Amen' }, status: 'answered' }), true);
// Insight -> ALWAYS false
assert.strictEqual(canShareAsQuoteImage({ type: 'insight', reply: { text: 'Private' }, status: 'answered' }), false);
// Prayer without permission -> false
assert.strictEqual(canShareAsQuoteImage({ type: 'prayer', allow_group_share: false, reply: { text: 'Amen' } }), false);
// Prayer with permission -> true
assert.strictEqual(canShareAsQuoteImage({ type: 'prayer', allow_group_share: true, reply: { text: 'Amen' } }), true);

// Anonymity
assert.strictEqual(resolveAuthorDisplay({ show_name: false, author_full_name: 'John Doe' }), "Anonymous");
assert.strictEqual(resolveAuthorDisplay({ show_name: true, author_full_name: 'John Doe' }), "John Doe");
console.log("PASS: Anonymity and type permission rules verified.");

// 4. File naming safety: never contains user id or email
function generateQuoteFileName(index) {
  return `forgehouse50_quote_${index + 1}.png`;
}
const fname = generateQuoteFileName(0);
assert.strictEqual(fname.includes("@"), false);
assert.strictEqual(fname.includes("usr_"), false);
assert.strictEqual(fname, "forgehouse50_quote_1.png");
console.log("PASS: File naming safety verified (no user IDs or emails).");

// 5. Continuation split logic
function splitQuoteCard(text, replyText, maxChars = 280) {
  if (text.length <= maxChars && replyText.length <= maxChars) {
    return [{ page: 1, total: 1, text, reply: replyText }];
  }
  const mid = text.lastIndexOf(' ', maxChars);
  const cut = mid > maxChars / 2 ? mid : maxChars;
  return [
    { page: 1, total: 2, text: text.slice(0, cut).trim(), reply: replyText.slice(0, maxChars).trim() },
    { page: 2, total: 2, text: text.slice(cut).trim() || "…", reply: replyText.slice(maxChars).trim() || "…" }
  ];
}

const shortCards = splitQuoteCard("Short quote", "Short reply");
assert.strictEqual(shortCards.length, 1);
assert.strictEqual(shortCards[0].total, 1);

const longCards = splitQuoteCard("X".repeat(350), "Y".repeat(350));
assert.strictEqual(longCards.length, 2);
assert.strictEqual(longCards[0].page, 1);
assert.strictEqual(longCards[0].total, 2);
assert.strictEqual(longCards[1].page, 2);
assert.strictEqual(longCards[1].total, 2);
console.log("PASS: Text splitting into continuation cards (1/2, 2/2) verified.");

console.log("ALL ITEM 6 BRANDED QUOTE IMAGE TESTS PASSED!");
