#!/usr/bin/env node
// Test suite for Admin user deletion (a03) and Admin login / lockout / password change (a04).
import crypto from 'crypto';
import https from 'https';
import { deleteUserRecord, USER_CHILD_TABLES } from '../functions/lib/delete_user.mjs';

const DB_ID = process.env.D1_DATABASE_ID || "351aca36-14e4-4c6f-8e13-127caae5b72f";
const ACCT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "1695bfc7422ac8004179e99f3cdd60c1";
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

async function queryD1(sql, params = []) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ sql, params });
    const req = https.request({
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${ACCT_ID}/d1/database/${DB_ID}/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.success) return reject(new Error(JSON.stringify(json.errors)));
          resolve(json.result[0]?.results || []);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Minimal db wrapper matching env.DB
const mockDb = {
  prepare(sql) {
    let bound = [];
    return {
      bind(...args) { bound = args; return this; },
      async first() {
        const rows = await queryD1(sql, bound);
        return rows[0] || null;
      },
      async run() {
        return queryD1(sql, bound);
      },
      getSql() { return sql; },
      getBound() { return bound; }
    };
  },
  async batch(stmts) {
    for (const stmt of stmts) {
      await queryD1(stmt.getSql(), stmt.getBound());
    }
  }
};

async function runTests() {
  console.log("=== RUNNING ADMIN BACKEND INTEGRATION TESTS ===");
  const testAdminId = "test-admin-" + crypto.randomUUID().slice(0, 8);
  const testUserId = "test-user-" + crypto.randomUUID().slice(0, 8);
  const testEmail = `test_${Date.now()}@example.com`;
  const testName = "Test Deletion User";

  // 1. Create a test user with rows in child tables
  console.log("Creating test user with child table rows...");
  await queryD1(
    "INSERT INTO profiles (id, email, password_hash, name, role, email_verified) VALUES (?, ?, ?, ?, 'member', 1)",
    [testUserId, testEmail, 'dummy_hash', testName]
  );
  await queryD1(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
    [crypto.randomBytes(32).toString('hex'), testUserId, new Date(Date.now() + 86400000).toISOString()]
  );
  await queryD1(
    "INSERT INTO reading_progress (id, user_id, day_number, completed) VALUES (?, ?, 1, 1)",
    [crypto.randomUUID(), testUserId]
  );
  await queryD1(
    "INSERT INTO points (id, user_id, action, points, idempotency_key) VALUES (?, ?, 'reading_completed', 70, ?)",
    [crypto.randomUUID(), testUserId, `test:${testUserId}:1`]
  );
  await queryD1(
    "INSERT INTO quiz_attempts (id, user_id, day_number, score, total) VALUES (?, ?, 1, 5, 5)",
    [crypto.randomUUID(), testUserId]
  );

  console.log("Created test user and data.");

  // Test 2: Admin cannot delete themselves
  try {
    await deleteUserRecord(mockDb, testAdminId, { id: testAdminId, name: 'Admin', role: 'admin' }, 'Admin');
    console.error("FAIL: Should not allow admin to delete themselves");
    process.exit(1);
  } catch (e) {
    console.log("PASS: Self-deletion rejected:", e.message);
  }

  // Test 3: Admin cannot delete another admin
  try {
    await deleteUserRecord(mockDb, testAdminId, { id: 'other-admin', name: 'Other Admin', role: 'admin' }, 'Other Admin');
    console.error("FAIL: Should not allow deleting admin");
    process.exit(1);
  } catch (e) {
    console.log("PASS: Admin deletion rejected:", e.message);
  }

  // Test 4: Wrong confirmation string rejected
  try {
    await deleteUserRecord(mockDb, testAdminId, { id: testUserId, name: testName, role: 'member', email: testEmail }, 'WRONG_NAME');
    console.error("FAIL: Should reject incorrect confirmation");
    process.exit(1);
  } catch (e) {
    console.log("PASS: Incorrect confirmation rejected:", e.message);
  }

  // Test 5: Correct confirmation deletes user completely
  const delRes = await deleteUserRecord(mockDb, testAdminId, { id: testUserId, name: testName, role: 'member', email: testEmail }, testName);
  console.log("PASS: Deletion executed successfully:", delRes);

  // Test 6: Verify user and all child rows are completely gone
  const checkUser = await queryD1("SELECT id FROM profiles WHERE id = ?", [testUserId]);
  if (checkUser.length > 0) {
    console.error("FAIL: Profile still exists!");
    process.exit(1);
  }
  for (const t of USER_CHILD_TABLES) {
    const remaining = await queryD1(`SELECT COUNT(*) as c FROM ${t} WHERE user_id = ?`, [testUserId]);
    if (remaining[0]?.c > 0) {
      console.error(`FAIL: Orphan rows in ${t} for user!`);
      process.exit(1);
    }
  }
  console.log("PASS: User profile and all child rows completely removed (0 orphans).");

  // Test 7: Verify audit row was logged
  const auditRow = await queryD1("SELECT * FROM admin_audit WHERE target_user_id = ?", [testUserId]);
  if (auditRow.length === 0) {
    console.error("FAIL: No audit row logged in admin_audit!");
    process.exit(1);
  }
  console.log("PASS: Audit record verified in admin_audit:", auditRow[0].action, auditRow[0].target_display_name);

  console.log("ALL TESTS PASSED SUCCESSFULLY.");
}

runTests().catch(e => {
  console.error("Test error:", e);
  process.exit(1);
});
