#!/usr/bin/env node
// tools/rotate-admin.mjs — Rotates or initializes the single dedicated admin credential in D1.
// Generates a readable admin username and cryptographically strong password,
// computes PBKDF2-SHA256 hash (100,000 iterations, 16-byte random salt),
// stores salt/hash in admin_credentials, and wipes all existing admin sessions.
//
// Usage:
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node tools/rotate-admin.mjs [--remote]

import crypto from 'crypto';
import https from 'https';
import { execSync } from 'child_process';

const PBKDF2_ITERATIONS = 100000;
const DB_ID = process.env.D1_DATABASE_ID || "351aca36-14e4-4c6f-8e13-127caae5b72f";
const ACCT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "1695bfc7422ac8004179e99f3cdd60c1";
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

function generateUsername() {
  const chars = '23456789abcdefghijkmnopqrstuvwxyz'; // no 0/O, 1/l/I
  const bytes = crypto.randomBytes(6);
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[bytes[i] % chars.length];
  }
  return `fh50-admin-${suffix}`;
}

function generatePassword() {
  // Cryptographically random, at least 20 chars, mixed case, digits, safe symbols.
  // No ambiguous characters: no 0, O, 1, l, I.
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%^&*-_+=';
  const all = lower + upper + digits + symbols;

  let pwd = '';
  // Guarantee at least one of each category
  pwd += lower[crypto.randomInt(0, lower.length)];
  pwd += upper[crypto.randomInt(0, upper.length)];
  pwd += digits[crypto.randomInt(0, digits.length)];
  pwd += symbols[crypto.randomInt(0, symbols.length)];

  // Fill up to 22 characters
  const remaining = 22 - pwd.length;
  for (let i = 0; i < remaining; i++) {
    pwd += all[crypto.randomInt(0, all.length)];
  }

  // Shuffle characters using Fisher-Yates
  const arr = pwd.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

async function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, 32, 'sha256', (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey.toString('hex'));
    });
  });
}

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
  const isQuiet = process.argv.includes('--json');
  const username = generateUsername();
  const password = generatePassword();
  const salt = crypto.randomBytes(16);
  const saltHex = salt.toString('hex');
  const hashHex = await hashPassword(password, salt);
  const storedHash = `pbkdf2$${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`;
  const adminId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Replace any existing admin credential and wipe old admin sessions
  await queryD1('DELETE FROM admin_sessions');
  await queryD1('DELETE FROM admin_credentials');
  await queryD1(
    'INSERT INTO admin_credentials (id, username, password_hash, salt, iterations, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [adminId, username, storedHash, saltHex, PBKDF2_ITERATIONS, now, now]
  );

  if (isQuiet) {
    console.log(JSON.stringify({ ok: true, username, password }));
  } else {
    console.log("=== FORGEHOUSE 50 ADMIN CREDENTIAL ROTATED ===");
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);
    console.log(`Hash: ${PBKDF2_ITERATIONS} iterations PBKDF2-SHA256`);
    console.log("Old admin sessions invalidated.");
    console.log("=============================================");
  }
}

main().catch(err => {
  console.error("Failed to rotate admin credential:", err);
  process.exit(1);
});
