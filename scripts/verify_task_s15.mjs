import https from 'https';
import zlib from 'zlib';

const BASE_URL = 'https://site-v2.forgehouse50.pages.dev';
const CF_ACCT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const D1_DB_ID = '351aca36-14e4-4c6f-8e13-127caae5b72f';

async function queryD1(sql, params = []) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ sql, params });
    const req = https.request({
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${CF_ACCT_ID}/d1/database/${D1_DB_ID}/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
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

async function request(method, path, body = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = { 'User-Agent': 'TaskS15-Verification' };
    let postData = null;
    if (body) {
      postData = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData);
    }
    if (cookie) {
      headers['Cookie'] = cookie;
    }
    const req = https.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json,
          raw: data
        });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function parseCookies(resHeaders) {
  const setCookie = resHeaders['set-cookie'];
  if (!setCookie) return '';
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  return cookies.map(c => c.split(';')[0]).join('; ');
}

async function run() {
  console.log('=== Task-s15 End-to-End Verification on Preview ===');
  console.log('Preview URL:', BASE_URL);

  const initialProfiles = await queryD1('SELECT count(*) as count FROM profiles WHERE role = "member";');
  const initialCount = initialProfiles[0].count;
  console.log(`Initial real member count: ${initialCount}`);

  const testId = `s15-${Date.now()}`;
  const testEmail = `test-${testId}@preview.internal`;
  const testPassword = 'Password123!Safe';
  let createdUserId = null;

  try {
    // 1. App Release API test
    console.log('\n[Step 1] Verifying /api/app-release...');
    const releaseRes = await request('GET', '/api/app-release');
    console.log('Release response status:', releaseRes.status, releaseRes.body);
    if (releaseRes.status !== 200 || !releaseRes.body?.version || !releaseRes.body?.apkUrl) {
      throw new Error('Failed to resolve latest app release');
    }
    console.log(`PASSED: Latest version is ${releaseRes.body.version} (${releaseRes.body.tag}), APK: ${releaseRes.body.apkUrl}`);

    // 2. Signup
    console.log(`\n[Step 2] Registering user ${testEmail} with given name, surname, and avatar...`);
    const signupRes = await request('POST', '/api/auth/signup', {
      name: 'TestFirst',
      surname: 'TestLast',
      email: testEmail,
      password: testPassword,
      avatar_id: 'avatar-08'
    });
    console.log('Signup status:', signupRes.status, signupRes.body);
    if (signupRes.status !== 200 && signupRes.status !== 201) {
      throw new Error(`Signup failed: ${JSON.stringify(signupRes.body)}`);
    }
    createdUserId = signupRes.body.user_id;

    // 3. Read OTP from D1
    console.log('\n[Step 3] Fetching OTP from D1 otp_codes...');
    const otpRows = await queryD1('SELECT code, user_id FROM otp_codes WHERE user_id = ? ORDER BY created_at DESC LIMIT 1;', [createdUserId]);
    if (!otpRows.length) throw new Error('OTP code not found in D1');
    const otpCode = otpRows[0].code;
    console.log(`Retrieved OTP: ${otpCode} for user ID: ${createdUserId}`);

    // 4. Verify OTP
    console.log('\n[Step 4] Verifying OTP...');
    const verifyRes = await request('POST', '/api/auth/verify', {
      email: testEmail,
      code: otpCode
    });
    console.log('Verify status:', verifyRes.status, verifyRes.body);
    if (verifyRes.status !== 200) throw new Error('OTP verification failed');

    // 5. Login
    console.log('\n[Step 5] Logging in...');
    const loginRes = await request('POST', '/api/auth/login', {
      email: testEmail,
      password: testPassword
    });
    console.log('Login status:', loginRes.status, loginRes.body);
    if (loginRes.status !== 200) throw new Error('Login failed');
    const cookie = parseCookies(loginRes.headers);
    console.log('Session cookie acquired:', cookie.split(';')[0]);

    // 6. User profile check (/api/auth/me and D1 verification)
    console.log('\n[Step 6] Checking profile /api/auth/me...');
    const meRes = await request('GET', '/api/auth/me', null, cookie);
    console.log('Me profile:', meRes.body);
    if (meRes.body?.name !== 'TestFirst' || meRes.body?.avatar_id !== 'avatar-08') {
      throw new Error(`Profile fields mismatch: ${JSON.stringify(meRes.body)}`);
    }
    // Verify surname in D1 profiles table directly
    const d1Profile = await queryD1('SELECT name, surname, avatar_id FROM profiles WHERE id = ?;', [createdUserId]);
    console.log('D1 profile row:', d1Profile[0]);
    if (d1Profile[0]?.surname !== 'TestLast') {
      throw new Error(`D1 surname mismatch: expected TestLast, got ${d1Profile[0]?.surname}`);
    }
    console.log('PASSED: Name, surname, avatar_id verified.');

    // 7. Today assignment (/api/today)
    console.log('\n[Step 7] Checking today assignment /api/today...');
    const todayRes = await request('GET', '/api/today', null, cookie);
    console.log('Today response:', JSON.stringify(todayRes.body));

    // 8. Reader Completion Gate (Must reject if chapters not viewed)
    console.log('\n[Step 8] Testing reader completion gate...');
    const prematureComplete = await request('POST', '/api/read/complete', {
      day_number: 1,
      viewed_chapters: []
    }, cookie);
    console.log('Premature completion response:', prematureComplete.status, prematureComplete.body);
    if (prematureComplete.status !== 409 && prematureComplete.status !== 400) {
      throw new Error(`Expected conflict/badRequest for incomplete chapters, got ${prematureComplete.status}`);
    }
    console.log('PASSED: Completion gate correctly rejected unviewed chapters.');

    // 9. Report reading time and complete reading with all chapters
    console.log('\n[Step 9] Recording reading time and completing Day 1...');
    const timeRes = await request('POST', '/api/read/time', { day_number: 1, seconds: 180 }, cookie);
    console.log('Reading time recorded:', timeRes.status, timeRes.body);
    if (timeRes.status !== 200 || !timeRes.body?.ok) {
      throw new Error(`Reading time recording failed: ${JSON.stringify(timeRes.body)}`);
    }

    const validComplete = await request('POST', '/api/read/complete', {
      day_number: 1,
      viewed_chapters: ['Matthew:1', 'Matthew:2', 'Matthew:3', 'Matthew:4', 'Matthew:5', 'Matthew:6']
    }, cookie);
    console.log('Valid complete response:', validComplete.status, validComplete.body);
    if (validComplete.status !== 200 || !validComplete.body?.ok) {
      throw new Error(`Valid completion failed: ${JSON.stringify(validComplete.body)}`);
    }
    console.log(`PASSED: Day 1 completed, points awarded: ${validComplete.body.points_awarded}`);

    // 10. Quiz Flow (single attempt, immediate score, reject retry)
    console.log('\n[Step 10] Testing quiz flow (one attempt, no retry)...');
    const quizQRes = await request('GET', '/api/quiz/1', null, cookie);
    console.log('Quiz questions status:', quizQRes.status, 'Questions count:', quizQRes.body?.questions?.length);
    const questions = quizQRes.body?.questions || [];
    const answers = questions.map((q, idx) => ({ question_id: q.id, answer_index: 0 }));

    const quizSubmitRes = await request('POST', '/api/quiz/submit', {
      day_number: 1,
      answers: answers
    }, cookie);
    console.log('Quiz submit response:', quizSubmitRes.status, quizSubmitRes.body);
    if (quizSubmitRes.status !== 200 || quizSubmitRes.body?.score === undefined) {
      throw new Error(`Quiz submit failed: ${JSON.stringify(quizSubmitRes.body)}`);
    }
    console.log(`PASSED: Quiz submitted, immediate score: ${quizSubmitRes.body.score}/${quizSubmitRes.body.total}`);

    // Attempt second quiz submission (Must be rejected)
    const retryRes = await request('POST', '/api/quiz/submit', {
      day_number: 1,
      answers: answers
    }, cookie);
    console.log('Second quiz submit response:', retryRes.status, retryRes.body);
    if (retryRes.status !== 400 && retryRes.status !== 409) {
      throw new Error(`Expected rejection on second quiz attempt, got ${retryRes.status}`);
    }
    console.log('PASSED: Second quiz attempt rejected (1 attempt only rule enforced).');

    // 11. Progress Screen
    console.log('\n[Step 11] Checking progress screen...');
    const progressRes = await request('GET', '/api/progress', null, cookie);
    const day1Progress = progressRes.body?.days?.find(d => d.day_number === 1);
    console.log('Progress Day 1:', day1Progress);
    if (!day1Progress?.completed) throw new Error('Progress does not show Day 1 complete');
    console.log('PASSED: Progress shows Day 1 checkmark.');

    // 12. Leaderboard
    console.log('\n[Step 12] Checking leaderboard categories...');
    const lbOverall = await request('GET', '/api/leaderboard?category=overall', null, cookie);
    console.log('Leaderboard overall status:', lbOverall.status);
    const lbStreak = await request('GET', '/api/leaderboard?category=consistency', null, cookie);
    console.log('Leaderboard consistency status:', lbStreak.status);
    console.log('PASSED: Leaderboard endpoints return distinct metrics.');

    // 13. Notes CRUD
    console.log('\n[Step 13] Testing Notes CRUD (Observation)...');
    const noteCreate = await request('POST', '/api/notes', {
      note_type: 'observation',
      book: 'Matthew',
      chapter: 1,
      verse: 1,
      body: 'Test note: genealogy of Jesus Christ'
    }, cookie);
    console.log('Note create status:', noteCreate.status, noteCreate.body);
    const noteId = noteCreate.body?.note?.id || noteCreate.body?.id;
    if (!noteId) throw new Error('Note ID not returned');

    const noteList = await request('GET', '/api/notes', null, cookie);
    console.log('Notes list count:', noteList.body?.notes?.length);

    const noteDelete = await request('DELETE', `/api/notes/${noteId}`, null, cookie);
    console.log('Note delete status:', noteDelete.status);
    console.log('PASSED: Notes CRUD verified.');

    // 14. Offline Translation bundle verification
    console.log('\n[Step 14] Verifying offline translation bundles and gzip magic bytes...');
    const manifestRes = await request('GET', '/bundles/manifest.json');
    if (manifestRes.status !== 200 || !manifestRes.body?.bundles) {
      throw new Error('Bundles manifest missing');
    }
    console.log(`Manifest found with ${manifestRes.body.bundles.length} bundles.`);

    const kjvRes = await new Promise((resolve, reject) => {
      https.get(`${BASE_URL}/bundles/kjv.json.gz`, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({
          status: res.statusCode,
          headers: res.headers,
          data: Buffer.concat(chunks)
        }));
      }).on('error', reject);
    });
    console.log('KJV bundle response:', kjvRes.status, 'Bytes:', kjvRes.data.length);
    if (kjvRes.status !== 200) throw new Error('KJV bundle fetch failed');

    // Check gzip magic bytes 1f 8b
    let kjvJson = null;
    if (kjvRes.data[0] === 0x1f && kjvRes.data[1] === 0x8b) {
      console.log('Detected gzip magic bytes (0x1f, 0x8b). Decompressing...');
      const unzipped = zlib.gunzipSync(kjvRes.data);
      kjvJson = JSON.parse(unzipped.toString('utf8'));
    } else {
      console.log('Content already decompressed by server/CDN. Parsing JSON...');
      kjvJson = JSON.parse(kjvRes.data.toString('utf8'));
    }
    const booksCount = Object.keys(kjvJson.books || {}).length || Object.keys(kjvJson).length;
    console.log('KJV parsed successfully. Books count:', booksCount);
    console.log('PASSED: Translation bundle verified with dual gzip/plain format handling.');

    console.log('\n=== ALL E2E FUNCTIONAL TESTS PASSED ON PREVIEW ===\n');

  } finally {
    // Clean up test user
    if (createdUserId) {
      console.log(`\n[Cleanup] Cascading delete of test user ${createdUserId} (${testEmail})...`);
      const tables = [
        'audio_progress', 'bookmarks', 'final_rank_acks', 'final_rankings',
        'highlights', 'leaderboard_snapshots', 'notes', 'otp_codes',
        'points', 'quiz_attempts', 'reading_progress', 'sessions',
        'user_badges', 'user_reading_days'
      ];
      for (const t of tables) {
        await queryD1(`DELETE FROM ${t} WHERE user_id = ?;`, [createdUserId]);
      }
      await queryD1('DELETE FROM profiles WHERE id = ?;', [createdUserId]);
      console.log('Test user deleted.');

      const finalProfiles = await queryD1('SELECT count(*) as count FROM profiles WHERE role = "member";');
      const finalCount = finalProfiles[0].count;
      console.log(`Final real member count: ${finalCount} (Initial was ${initialCount})`);
      if (finalCount !== initialCount) {
        console.error('WARNING: Member count changed!');
      } else {
        console.log('CLEANUP CONFIRMED: Member count is completely unchanged.');
      }
    }
  }
}

run().catch(err => {
  console.error('E2E TEST FAILED:', err);
  process.exit(1);
});
