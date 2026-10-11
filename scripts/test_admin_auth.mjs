#!/usr/bin/env node
// Test verification for Task a04: Admin login, lockout, 12h sessions, password change
import crypto from 'crypto';
import https from 'https';
import {
  hashPassword,
  verifyPassword,
  ADMIN_SESSION_TTL_MS,
  ADMIN_LOCKOUT_MAX_ATTEMPTS,
  checkAdminLockout,
  recordAdminAttempt,
} from '../functions/lib/auth.mjs';

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
  console.log("=== RUNNING ADMIN AUTH TESTS (a04) ===");

  // 1. Password hashing and verification
  const testPwd = "SecretPassword123!@#";
  const hash = await hashPassword(testPwd);
  console.log("Generated hash:", hash.split('$').slice(0, 3).join('$') + "$...");
  const valid = await verifyPassword(testPwd, hash);
  const invalid = await verifyPassword("WrongPassword", hash);
  if (!valid || invalid) {
    console.error("FAIL: Password verification failed!");
    process.exit(1);
  }
  console.log("PASS: Password hashing and verification matches PBKDF2-SHA256.");

  // 2. 12-hour session TTL check
  if (ADMIN_SESSION_TTL_MS !== 12 * 60 * 60 * 1000) {
    console.error("FAIL: Admin session TTL is not 12 hours!");
    process.exit(1);
  }
  console.log("PASS: Admin session TTL is exactly 12 hours (43,200,000 ms).");

  // 3. Brute-force lockout after 5 failed attempts
  const testUser = "lockout-test-" + crypto.randomUUID().slice(0, 6);
  const testIp = "192.168.1.100";

  // Initially not locked
  let lockCheck = await checkAdminLockout(mockDb, testUser, testIp);
  if (lockCheck.locked) {
    console.error("FAIL: Should not be locked initially");
    process.exit(1);
  }

  // Record 5 failed attempts
  console.log("Recording 5 failed attempts...");
  for (let i = 0; i < 5; i++) {
    await recordAdminAttempt(mockDb, testUser, testIp, false);
  }

  lockCheck = await checkAdminLockout(mockDb, testUser, testIp);
  if (!lockCheck.locked) {
    console.error("FAIL: Should be locked after 5 failed attempts!");
    process.exit(1);
  }
  console.log(`PASS: Brute force lockout active: locked=${lockCheck.locked}, remaining=${lockCheck.remainingMinutes}m.`);

  // Cleanup test attempts
  await queryD1("DELETE FROM admin_login_attempts WHERE identifier = ? OR identifier = ?", [testUser.toLowerCase(), testIp]);
  console.log("Cleaned up test lockout attempts.");

  console.log("ALL AUTH TESTS (a04) PASSED.");
}

runTests().catch(e => {
  console.error("Auth test error:", e);
  process.exit(1);
});
