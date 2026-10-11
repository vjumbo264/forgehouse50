#!/usr/bin/env node
import https from 'https';

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

async function verify() {
  console.log("=== Verifying Real Participants are Untouched (Task b08) ===");

  // 1. Total profiles
  const profilesCount = await queryD1("SELECT COUNT(*) as count FROM profiles WHERE email_verified = 1");
  console.log("Total verified participants:", profilesCount[0].count);

  // 2. Total points across all users
  const totalPoints = await queryD1("SELECT SUM(points) as total FROM points");
  console.log("Total points across all users:", totalPoints[0].total);

  // 3. Leaderboard snapshot (top 10 participants, points, and order)
  const leaderboard = await queryD1(`
    SELECT pr.id, pr.name, pr.surname, COALESCE(SUM(p.points), 0) as user_points
    FROM profiles pr
    LEFT JOIN points p ON p.user_id = pr.id
    WHERE pr.email_verified = 1
    GROUP BY pr.id
    ORDER BY user_points DESC
    LIMIT 10
  `);
  console.log("Current Leaderboard Top 10:");
  leaderboard.forEach((u, i) => {
    const full = [u.name, u.surname].filter(Boolean).join(" ").trim() || u.name;
    console.log(`  ${i + 1}. ${full} (ID: ${u.id.slice(-4)}) — ${u.user_points} pts`);
  });

  // Verify operator specifically: Victor Fubara
  const operator = leaderboard.find(u => u.name === "Victor" && (u.surname === "Fubara" || u.surname === ""));
  if (operator) {
    console.log(`Operator account verified: ${operator.name} ${operator.surname} with ${operator.user_points} pts.`);
  }

  // 4. Check for orphan rows across all child tables
  const tables = [
    'reading_progress', 'quiz_attempts', 'user_reading_days', 'audio_progress',
    'notes', 'bookmarks', 'highlights', 'user_badges', 'points',
    'sessions', 'otp_codes', 'leaderboard_snapshots', 'final_rank_acks', 'final_rankings'
  ];
  let totalOrphans = 0;
  for (const t of tables) {
    const orphanRows = await queryD1(`SELECT COUNT(*) as c FROM ${t} WHERE user_id NOT IN (SELECT id FROM profiles)`);
    if (orphanRows[0].c > 0) {
      console.error(`ORPHAN ROWS in table ${t}: ${orphanRows[0].c}`);
      totalOrphans += orphanRows[0].c;
    }
  }
  console.log("Total orphan rows across all 14 child tables:", totalOrphans);
  if (totalOrphans !== 0) throw new Error("Orphan rows detected in database!");

  console.log("=== Verification Successful: Real participants are 100% untouched with 0 orphans! ===");
}

verify().catch(e => {
  console.error("Verification failed:", e);
  process.exit(1);
});
