#!/usr/bin/env node
import { execSync } from 'child_process';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "1695bfc7422ac8004179e99f3cdd60c1";
const DB_ID = process.env.CLOUDFLARE_D1_DATABASE_ID || "351aca36-14e4-4c6f-8e13-127caae5b72f";
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!TOKEN) {
  console.log("CLOUDFLARE_API_TOKEN not set; skipping live D1 query check.");
  process.exit(0);
}

function queryD1(sql) {
  const payload = JSON.stringify({ sql });
  const res = execSync(`curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}/query" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d '${payload.replace(/'/g, "'\\''")}'`, { encoding: 'utf8' });
  const data = JSON.parse(res);
  if (!data.success) throw new Error(JSON.stringify(data.errors));
  return data.result?.[0]?.results || [];
}

console.log("=== Testing Notes & Insights Table Constraints in D1 ===");

const validUser = queryD1("SELECT id FROM profiles LIMIT 1")[0].id;
const testId = "test-note-" + Date.now();

console.log("Test 1: Inserting all 5 note types (including insight)...");
const types = ['observation', 'question', 'prayer', 'application', 'insight'];
for (const t of types) {
  const id = `${testId}-${t}`;
  queryD1(`INSERT INTO notes (id, user_id, note_type, body, book, chapter, verse, created_at, updated_at)
           VALUES ('${id}', '${validUser}', '${t}', 'Test ${t} note text', 'Matthew', 1, 1, datetime('now'), datetime('now'))`);
  console.log(`  ✓ Note type '${t}' inserted successfully`);
}

// 2. Verify Insight is NOT in leader_inbox
console.log("Test 2: Verifying Insight note isolation...");
const inboxInsight = queryD1(`SELECT * FROM leader_inbox WHERE type = 'insight'`);
if (inboxInsight.length > 0) throw new Error("Insight found in leader_inbox! Violation of privacy policy.");
console.log("  ✓ Zero insight notes in leader_inbox (privacy policy strictly preserved)");

// 3. Clean up test notes
console.log("Test 3: Cleaning up test data...");
queryD1(`DELETE FROM notes WHERE id LIKE '${testId}%'`);
console.log("  ✓ Test data cleaned up cleanly");

console.log("\nAll Notes & Insights D1 tests PASSED 100%!");
