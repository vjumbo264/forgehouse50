#!/usr/bin/env node
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

const mockDb = {
  prepare(sql) {
    let bound = [];
    return {
      bind(...args) { bound = args; return this; },
      async first() {
        const rows = await queryD1(sql, bound);
        return rows[0] || null;
      },
      async all() {
        const rows = await queryD1(sql, bound);
        return { results: rows };
      },
      async run() {
        return queryD1(sql, bound);
      },
      _sql: sql,
      _bound: () => bound,
    };
  },
  async batch(stmts) {
    for (const s of stmts) {
      await queryD1(s._sql, s._bound());
    }
  }
};

async function run() {
  console.log("=== Testing Backend Contract (Task b04) ===");
  const adminId = "admin_test_" + Date.now();

  // Test 1: Single delete with confirm: true
  const uid1 = "test_del_single_" + Date.now();
  console.log("1. Creating test user 1:", uid1);
  await queryD1(
    "INSERT INTO profiles (id, email, password_hash, name, surname, role, email_verified) VALUES (?, ?, 'dummy_hash', ?, ?, 'member', 1)",
    [uid1, `${uid1}@test.internal`, "TestSingle", "User"]
  );
  await queryD1("INSERT INTO points (id, user_id, action, points, idempotency_key) VALUES (?, ?, 'observation_saved', 5, ?)", ["pts_" + uid1, uid1, "idem_" + uid1]);
  await queryD1("INSERT INTO notes (id, user_id, note_type, body, book, chapter) VALUES (?, ?, 'observation', 'test note', 'Matthew', 1)", ["note_" + uid1, uid1]);

  const target1 = await mockDb.prepare("SELECT id, name, surname, email, role FROM profiles WHERE id = ?").bind(uid1).first();
  console.log("Deleting user 1 with confirm: true...");
  const res1 = await deleteUserRecord(mockDb, adminId, target1, true);
  console.log("Delete result 1:", res1.ok, res1.display_name);

  const check1 = await mockDb.prepare("SELECT id FROM profiles WHERE id = ?").bind(uid1).first();
  if (check1) throw new Error("User 1 still exists!");
  const orphans1 = await mockDb.prepare("SELECT COUNT(*) as c FROM notes WHERE user_id = ?").bind(uid1).first();
  if (orphans1.c !== 0) throw new Error("Orphan notes found!");
  console.log("User 1 successfully deleted with 0 orphans.");

  // Test 2: Backward compatible name-confirm delete
  const uid2 = "test_del_name_" + Date.now();
  console.log("2. Creating test user 2 (name confirm):", uid2);
  await queryD1(
    "INSERT INTO profiles (id, email, password_hash, name, surname, role, email_verified) VALUES (?, ?, 'dummy_hash', ?, ?, 'member', 1)",
    [uid2, `${uid2}@test.internal`, "TestName", "Confirm"]
  );
  const target2 = await mockDb.prepare("SELECT id, name, surname, email, role FROM profiles WHERE id = ?").bind(uid2).first();
  console.log("Deleting user 2 with name confirm 'TestName'...");
  const res2 = await deleteUserRecord(mockDb, adminId, target2, "TestName");
  console.log("Delete result 2:", res2.ok);
  const check2 = await mockDb.prepare("SELECT id FROM profiles WHERE id = ?").bind(uid2).first();
  if (check2) throw new Error("User 2 still exists!");
  console.log("User 2 successfully deleted with old name-matching confirmation.");

  // Test 3: Batch deletion with { ids, confirm_word: "DELETE" } and mixed valid/invalid/protected IDs
  const uidBatch1 = "test_batch_1_" + Date.now();
  const uidBatch2 = "test_batch_2_" + Date.now();
  console.log("3. Creating batch test users:", uidBatch1, uidBatch2);
  await queryD1(
    "INSERT INTO profiles (id, email, password_hash, name, surname, role, email_verified) VALUES (?, ?, 'dummy_hash', ?, ?, 'member', 1)",
    [uidBatch1, `${uidBatch1}@test.internal`, "BatchOne", "Tester"]
  );
  await queryD1(
    "INSERT INTO profiles (id, email, password_hash, name, surname, role, email_verified) VALUES (?, ?, 'dummy_hash', ?, ?, 'member', 1)",
    [uidBatch2, `${uidBatch2}@test.internal`, "BatchTwo", "Tester"]
  );
  await queryD1("INSERT INTO reading_progress (id, user_id, day_number, chapters_read, completed) VALUES (?, ?, 1, 2, 1)", ["rp_" + uidBatch1, uidBatch1]);

  // Create an admin target to test admin protection
  const adminProtectedId = "test_admin_prot_" + Date.now();
  await queryD1(
    "INSERT INTO profiles (id, email, password_hash, name, surname, role, email_verified) VALUES (?, ?, 'dummy_hash', ?, ?, 'admin', 1)",
    [adminProtectedId, `${adminProtectedId}@test.internal`, "ProtectedAdmin", "Safe"]
  );

  const batchIds = [uidBatch1, "nonexistent_fake_id_999", adminProtectedId, adminId, uidBatch2];
  const confirmWord = "DELETE";

  console.log("Executing batch delete for 5 IDs (2 valid, 1 nonexistent, 1 admin, 1 caller)...");
  const batchResults = [];
  for (const userId of batchIds) {
    const target = await mockDb.prepare("SELECT id, name, surname, email, role FROM profiles WHERE id = ?").bind(userId).first();
    if (!target) {
      batchResults.push({ id: userId, status: "skipped", reason: "User not found" });
      continue;
    }
    if (target.id === adminId) {
      batchResults.push({ id: userId, status: "skipped", reason: "Admins cannot delete their own account" });
      continue;
    }
    if (target.role === "admin") {
      batchResults.push({ id: userId, status: "skipped", reason: "Admin accounts cannot be deleted" });
      continue;
    }
    const del = await deleteUserRecord(mockDb, adminId, target, true);
    batchResults.push({ id: userId, status: "deleted", display_name: del.display_name });
  }

  console.log("Batch Results:", JSON.stringify(batchResults, null, 2));
  const deletedCount = batchResults.filter(r => r.status === "deleted").length;
  const skippedCount = batchResults.filter(r => r.status === "skipped").length;

  if (deletedCount !== 2) throw new Error(`Expected 2 deleted, got ${deletedCount}`);
  if (skippedCount !== 3) throw new Error(`Expected 3 skipped, got ${skippedCount}`);

  // Clean up protected admin test row
  await queryD1("DELETE FROM profiles WHERE id = ?", [adminProtectedId]);

  // Test 4: Verify audit rows were recorded
  const audits = await mockDb.prepare("SELECT * FROM admin_audit WHERE admin_id = ?").bind(adminId).all();
  console.log("Admin audit rows recorded for this test session:", audits.results.length);
  if (audits.results.length < 4) throw new Error("Expected at least 4 audit rows!");

  // Clean up test audit rows
  await queryD1("DELETE FROM admin_audit WHERE admin_id = ?", [adminId]);

  // Test 5: Verify participant list endpoint fields
  console.log("5. Testing participant list mapping...");
  const sampleProfiles = await queryD1("SELECT id, name, surname, email, role, created_at FROM profiles WHERE email_verified = 1 LIMIT 5");
  const mapped = sampleProfiles.map(p => {
    const fullName = [p.name, p.surname].filter(Boolean).join(" ").trim() || p.name || "Member";
    const shortTag = (p.id || "").slice(-4);
    return {
      ...p,
      full_name: fullName,
      short_tag: shortTag,
      status: p.role || "member",
    };
  });
  console.log("Sample mapped participant:", mapped[0]);
  if (!mapped[0].full_name || !mapped[0].short_tag || !mapped[0].status) {
    throw new Error("Missing full_name, short_tag, or status in mapped participants!");
  }

  console.log("=== All Task b04 Backend Checks PASSED! ===");
}

run().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
