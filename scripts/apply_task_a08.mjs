import https from 'https';

const DB_ID = process.env.D1_DATABASE_ID || "351aca36-14e4-4c6f-8e13-127caae5b72f";
const ACCT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "1695bfc7422ac8004179e99f3cdd60c1";
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

function queryD1(sql, params = []) {
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
        const json = JSON.parse(data);
        resolve(json.result[0]?.results || []);
      });
    });
    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log("=== APPLYING TASK a08: RETIRE EMAIL ADMIN ROLE & PRESERVE PARTICIPANTS ===");

  // Check before state
  const before = await queryD1("SELECT id, name, surname, email, role, (SELECT SUM(points) FROM points WHERE user_id = profiles.id) as total_points, (SELECT COUNT(*) FROM reading_progress WHERE user_id = profiles.id AND completed = 1) as days_completed FROM profiles WHERE email = 'jumbovictorfubara@gmail.com' OR email = 'vjumbo264@gmail.com'");
  console.log("Before state:", JSON.stringify(before, null, 2));

  // Remove admin role from all profile rows
  await queryD1("UPDATE profiles SET role = 'member' WHERE role = 'admin'");

  // Check after state
  const after = await queryD1("SELECT id, name, surname, email, role, (SELECT SUM(points) FROM points WHERE user_id = profiles.id) as total_points, (SELECT COUNT(*) FROM reading_progress WHERE user_id = profiles.id AND completed = 1) as days_completed FROM profiles WHERE email = 'jumbovictorfubara@gmail.com' OR email = 'vjumbo264@gmail.com'");
  console.log("After state:", JSON.stringify(after, null, 2));

  // Check all profiles count and roles
  const roles = await queryD1("SELECT DISTINCT role, COUNT(*) as c FROM profiles GROUP BY role");
  console.log("Profile role breakdown:", roles);

  // Compare Victor Fubara points and days
  const vfBefore = before.find(p => p.email === 'jumbovictorfubara@gmail.com');
  const vfAfter = after.find(p => p.email === 'jumbovictorfubara@gmail.com');
  if (vfBefore.total_points !== vfAfter.total_points || vfBefore.days_completed !== vfAfter.days_completed) {
    throw new Error("MISMATCH: Victor Fubara points/progress changed!");
  }
  console.log(`CONFIRMED: Victor Fubara points (${vfAfter.total_points}) and days completed (${vfAfter.days_completed}) are 100% IDENTICAL before and after.`);
  console.log("CONFIRMED: All profile-based admin rights retired.");
}
run().catch(e => {
  console.error("Error applying a08:", e);
  process.exit(1);
});
