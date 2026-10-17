#!/usr/bin/env node
// Cascade check script: lists every table with a user reference and reports orphan rows.
// Works via Cloudflare D1 REST API (fast) or wrangler fallback.

import https from 'https';
import { execSync } from 'child_process';

const DB_ID = process.env.D1_DATABASE_ID || "351aca36-14e4-4c6f-8e13-127caae5b72f";
const ACCT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "1695bfc7422ac8004179e99f3cdd60c1";
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

async function queryD1(sql, params = []) {
  if (API_TOKEN) {
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
  } else {
    const cmd = `wrangler d1 execute forgehouse50-db --remote --json --command="${sql.replace(/"/g, '\\"')}"`;
    const out = execSync(cmd, { encoding: 'utf8', env: process.env, maxBuffer: 10 * 1024 * 1024 });
    const parsed = JSON.parse(out);
    return parsed[0]?.results || [];
  }
}

async function main() {
  console.log("Checking all tables in D1 for user references and orphans...");
  const tables = await queryD1("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' AND name != 'sqlite_sequence' ORDER BY name");

  const userTables = [];
  for (const t of tables) {
    const tableName = t.name;
    const cols = await queryD1(`PRAGMA table_info(${tableName})`);
    if (cols.some(c => c.name === 'user_id' || c.name === 'author_user_id')) {
      userTables.push(tableName);
    }
  }

  console.log(`Found ${userTables.length} tables referencing users:`, userTables.join(", "));

  let totalOrphans = 0;
  for (const t of userTables) {
    const res = await queryD1(`SELECT COUNT(*) AS total, (SELECT COUNT(*) FROM ${t} WHERE (CASE WHEN '${t}' = 'leader_inbox' THEN author_user_id ELSE user_id END) NOT IN (SELECT id FROM profiles)) AS orphans FROM ${t}`);
    const total = res[0]?.total ?? 0;
    const orphans = res[0]?.orphans ?? 0;
    console.log(`  Table [${t}]: ${total} total rows, ${orphans} orphan rows`);
    if (orphans > 0) totalOrphans += orphans;
  }

  if (totalOrphans > 0) {
    console.error(`FAILED: Found ${totalOrphans} orphan rows!`);
    process.exit(1);
  } else {
    console.log("SUCCESS: 0 orphan rows found across all user-referencing tables.");
  }
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
