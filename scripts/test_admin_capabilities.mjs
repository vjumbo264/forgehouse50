#!/usr/bin/env node
import crypto from 'crypto';
import https from 'https';
import { onRequestGet as getStats } from '../functions/api/admin/stats.mjs';
import { onRequestGet as getProgramme } from '../functions/api/admin/programme.mjs';
import { onRequestGet as getParticipants } from '../functions/api/admin/participants.mjs';

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
        const results = await queryD1(sql, bound);
        return { results };
      },
      async run() {
        return queryD1(sql, bound);
      }
    };
  },
  async batch(stmts) {
    for (const stmt of stmts) {
      await stmt.run();
    }
  }
};

async function main() {
  console.log("=== VERIFYING ALL ADMIN ENDPOINTS WITH ADMIN SESSION (a05) ===");

  const adminId = "a05-admin-" + Date.now();
  const username = "fh50-a05-" + Date.now().toString(36);
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString();

  await queryD1(
    "INSERT INTO admin_credentials (id, username, password_hash, salt, iterations) VALUES (?, ?, 'hash', 'salt', 100000)",
    [adminId, username]
  );
  await queryD1(
    "INSERT INTO admin_sessions (id, admin_id, expires_at) VALUES (?, ?, ?)",
    [sessionToken, adminId, expiresAt]
  );

  const headers = new Map([
    ['cookie', `fh50_session=${sessionToken}`],
    ['user-agent', 'TestRunner']
  ]);
  const mockRequest = {
    headers: {
      get: (k) => headers.get(k.toLowerCase()) || null
    }
  };

  const env = { DB: mockDb };

  // 1. Stats endpoint
  console.log("Testing /api/admin/stats...");
  const statsRes = await getStats({ request: mockRequest, env });
  const statsJson = await statsRes.json();
  if (statsRes.status !== 200 || statsJson.total_participants === undefined) {
    throw new Error("/api/admin/stats failed: " + JSON.stringify(statsJson));
  }
  console.log("  PASS: /api/admin/stats returned total_participants=" + statsJson.total_participants);

  // 2. Programme endpoint
  console.log("Testing /api/admin/programme...");
  const progRes = await getProgramme({ request: mockRequest, env });
  const progJson = await progRes.json();
  if (progRes.status !== 200 || progJson.eligible_participants === undefined) {
    throw new Error("/api/admin/programme failed: " + JSON.stringify(progJson));
  }
  console.log("  PASS: /api/admin/programme returned eligible_participants=" + progJson.eligible_participants);

  // 3. Participants endpoint
  console.log("Testing /api/admin/participants...");
  const partsRes = await getParticipants({ request: mockRequest, env });
  const partsJson = await partsRes.json();
  if (partsRes.status !== 200 || !Array.isArray(partsJson.participants)) {
    throw new Error("/api/admin/participants failed: " + JSON.stringify(partsJson));
  }
  console.log(`  PASS: /api/admin/participants returned ${partsJson.participants.length} participants.`);

  // Clean up
  await queryD1("DELETE FROM admin_sessions WHERE id = ?", [sessionToken]);
  await queryD1("DELETE FROM admin_credentials WHERE id = ?", [adminId]);

  console.log("ALL EXISTING ADMIN ENDPOINTS VERIFIED WITH NEW ADMIN SESSION (a05 PASSED).");
}

main().catch(err => {
  console.error("Endpoint test error:", err);
  process.exit(1);
});
