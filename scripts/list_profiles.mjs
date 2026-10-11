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
  const users = await queryD1("SELECT id, name, surname, email, role FROM profiles ORDER BY created_at");
  console.log(`Current profiles in D1 (${users.length} total):`);
  for (const u of users) {
    console.log(` - ${u.id} | ${u.name} ${u.surname} | ${u.email} (${u.role})`);
  }
}
run();
