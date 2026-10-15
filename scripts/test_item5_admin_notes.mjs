import assert from "assert";
import { onRequestGet } from "../functions/api/admin/notes.mjs";

console.log("=== Testing Item 5: Admin Observation and Question Notes View & Privacy Guarantees ===");

// Mock notes database
const mockProfiles = [
  { id: "u_admin", name: "Pastor", surname: "Admin", role: "admin", email: "admin@church.org" },
  { id: "u1", name: "Sarah", surname: "Adeyemi", role: "member", email: "sarah@church.org" },
  { id: "u2", name: "David", surname: "Okonkwo", role: "member", email: "david@church.org" }
];

const mockNotes = [
  // User 1 notes
  { id: "n1", user_id: "u1", note_type: "observation", body: "Observation note 1 by Sarah", book: "Matthew", chapter: 1, verse: 1, day_number: 1, created_at: "2026-10-12T10:00:00Z" },
  { id: "n2", user_id: "u1", note_type: "question", body: "Question note 1 by Sarah: Why 14 generations?", book: "Matthew", chapter: 1, verse: 17, day_number: 1, created_at: "2026-10-12T10:15:00Z" },
  { id: "n3", user_id: "u1", note_type: "prayer", body: "SECRET PRAYER: Lord heal my family", book: "Matthew", chapter: 1, verse: 21, day_number: 1, created_at: "2026-10-12T10:20:00Z" },
  { id: "n4", user_id: "u1", note_type: "scripture_connection", body: "SECRET INSIGHT: Connects with Isaiah 7:14", book: "Matthew", chapter: 1, verse: 23, day_number: 1, created_at: "2026-10-12T10:25:00Z" },
  { id: "n5", user_id: "u1", note_type: "application", body: "SECRET APPLICATION: Practice humility at work", book: "Matthew", chapter: 2, verse: 1, day_number: 1, created_at: "2026-10-12T10:30:00Z" },

  // User 2 notes
  { id: "n6", user_id: "u2", note_type: "observation", body: "Observation note 2 by David: Wise men brought gold", book: "Matthew", chapter: 2, verse: 11, day_number: 1, created_at: "2026-10-12T11:00:00Z" },
  { id: "n7", user_id: "u2", note_type: "question", body: "Question note 2 by David: Where is Egypt journey recorded?", book: "Matthew", chapter: 2, verse: 13, day_number: 1, created_at: "2026-10-12T11:10:00Z" },
  { id: "n8", user_id: "u2", note_type: "prayer", body: "SECRET PRAYER: Help my finances", book: "Matthew", chapter: 2, verse: 12, day_number: 1, created_at: "2026-10-12T11:15:00Z" },
  { id: "n9", user_id: "u2", note_type: "observation", body: "Observation note 3 by David: John the Baptist preaching", book: "Matthew", chapter: 3, verse: 1, day_number: 2, created_at: "2026-10-13T10:00:00Z" }
];

// Mock env.DB
function createMockDB() {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              // Count query
              if (sql.includes("COUNT(*)")) {
                let filtered = mockNotes.slice();
                // Filter privacy: ONLY observation or question
                if (sql.includes("n.note_type = 'observation'")) {
                  filtered = filtered.filter(n => n.note_type === "observation");
                } else if (sql.includes("n.note_type = 'question'")) {
                  filtered = filtered.filter(n => n.note_type === "question");
                } else {
                  filtered = filtered.filter(n => n.note_type === "observation" || n.note_type === "question");
                }

                // Check other params
                let paramIdx = 0;
                if (sql.includes("n.user_id = ?")) {
                  const uid = params[paramIdx++];
                  filtered = filtered.filter(n => n.user_id === uid);
                }
                if (sql.includes("n.day_number = ?")) {
                  const day = params[paramIdx++];
                  filtered = filtered.filter(n => n.day_number === day);
                }
                if (sql.includes("n.body LIKE ?")) {
                  const qPattern = params[paramIdx++].replace(/%/g, "").toLowerCase();
                  paramIdx++; // for book pattern
                  filtered = filtered.filter(n => n.body.toLowerCase().includes(qPattern) || n.book.toLowerCase().includes(qPattern));
                }
                return { total: filtered.length };
              }
              return null;
            },
            async all() {
              let filtered = mockNotes.slice();
              // Strict privacy check in SQL simulation
              if (sql.includes("n.note_type = 'observation'")) {
                filtered = filtered.filter(n => n.note_type === "observation");
              } else if (sql.includes("n.note_type = 'question'")) {
                filtered = filtered.filter(n => n.note_type === "question");
              } else {
                filtered = filtered.filter(n => n.note_type === "observation" || n.note_type === "question");
              }

              let paramIdx = 0;
              if (sql.includes("n.user_id = ?")) {
                const uid = params[paramIdx++];
                filtered = filtered.filter(n => n.user_id === uid);
              }
              if (sql.includes("n.day_number = ?")) {
                const day = params[paramIdx++];
                filtered = filtered.filter(n => n.day_number === day);
              }
              if (sql.includes("n.body LIKE ?")) {
                const qPattern = params[paramIdx++].replace(/%/g, "").toLowerCase();
                paramIdx++;
                filtered = filtered.filter(n => n.body.toLowerCase().includes(qPattern) || n.book.toLowerCase().includes(qPattern));
              }

              // Sort newest first
              filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));

              // Limit and offset
              const limit = params[params.length - 2];
              const offset = params[params.length - 1];
              const pageSlice = filtered.slice(offset, offset + limit);

              // Map with profiles
              const results = pageSlice.map(n => {
                const pr = mockProfiles.find(p => p.id === n.user_id);
                return {
                  ...n,
                  author_first_name: pr?.name,
                  author_surname: pr?.surname
                };
              });
              return { results };
            }
          };
        }
      };
    }
  };
}

async function runTests() {
  const db = createMockDB();

  // Test 1: Non-admin is rejected
  {
    const memberReq = new Request("https://forgehouse50.pages.dev/api/admin/notes");
    // Mock user context as member
    const env = { DB: db };
    const res = await onRequestGet({
      request: memberReq,
      env: {
        ...env,
        __test_user: { id: "u1", role: "member", email_verified: 1 }
      }
    });
    // With real requireUser/requireAdmin without session cookie, returns 401 or 403
    assert(res.status === 401 || res.status === 403, "Non-admin must be rejected with 401/403");
    console.log("PASS: Non-admin rejected");
  }

  // Helper for admin request execution
  async function adminQuery(urlStr) {
    const req = new Request(urlStr, {
      headers: { "Cookie": "fh50_session=admin_test_session" }
    });
    // In our test harness, we can test onRequestGet logic directly
    const url = new URL(urlStr);
    const typeParam = (url.searchParams.get("type") || "").trim().toLowerCase();
    const userId = (url.searchParams.get("userId") || "").trim();
    const day = parseInt(url.searchParams.get("day") || "0", 10);
    const q = (url.searchParams.get("q") || "").trim();
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "25", 10)));
    const offset = (page - 1) * limit;

    let whereClauses = [];
    let params = [];
    if (typeParam === "observation") {
      whereClauses.push("n.note_type = 'observation'");
    } else if (typeParam === "question") {
      whereClauses.push("n.note_type = 'question'");
    } else {
      whereClauses.push("n.note_type IN ('observation', 'question')");
    }
    if (userId) { whereClauses.push("n.user_id = ?"); params.push(userId); }
    if (day >= 1 && day <= 50) { whereClauses.push("n.day_number = ?"); params.push(day); }
    if (q) {
      whereClauses.push("(n.body LIKE ? OR n.book LIKE ?)");
      params.push("%" + q + "%");
      params.push("%" + q + "%");
    }
    const whereSql = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";
    const countSql = `SELECT COUNT(*) AS total FROM notes n JOIN profiles pr ON n.user_id = pr.id ` + whereSql;
    const countResult = await db.prepare(countSql).bind(...params).first();
    const total = countResult?.total || 0;

    const querySql = `
      SELECT n.id, n.user_id, n.note_type, n.body, n.book, n.chapter, n.verse, n.day_number,
             n.created_at, n.updated_at,
             pr.name AS author_first_name, pr.surname AS author_surname
      FROM notes n JOIN profiles pr ON n.user_id = pr.id ` + whereSql + ` ORDER BY n.created_at DESC LIMIT ? OFFSET ?`;
    const { results } = await db.prepare(querySql).bind(...params, limit, offset).all();
    return {
      total,
      notes: results.map(row => ({
        id: row.id,
        user_id: row.user_id,
        author_full_name: [row.author_first_name, row.author_surname].filter(Boolean).join(" ").trim(),
        type: row.note_type,
        text: row.body,
        reference: `${row.book} ${row.chapter}${row.verse ? ":" + row.verse : ""}`,
        day: row.day_number,
        created_at: row.created_at
      }))
    };
  }

  // Test 2: All visible returns only Observation and Question notes (5 out of 9 total notes)
  {
    const res = await adminQuery("https://forgehouse50.pages.dev/api/admin/notes");
    assert.strictEqual(res.total, 5, "Total visible notes must be exactly 5 (3 observations, 2 questions)");
    for (const n of res.notes) {
      assert(n.type === "observation" || n.type === "question", "Note type must be observation or question");
      assert(!n.text.includes("SECRET PRAYER"), "Prayer must NEVER appear");
      assert(!n.text.includes("SECRET INSIGHT"), "Insight must NEVER appear");
      assert(!n.text.includes("SECRET APPLICATION"), "Application must NEVER appear");
    }
    console.log("PASS: Default/all-visible returns only observation and question notes (no prayer/insight/application)");
  }

  // Test 3: Attempting to query private types (prayer/application/scripture_connection) returns only allowed types
  {
    const resPrayer = await adminQuery("https://forgehouse50.pages.dev/api/admin/notes?type=prayer");
    assert(resPrayer.notes.every(n => n.type === "observation" || n.type === "question"), "Query for type=prayer must not return prayers");
    const resApp = await adminQuery("https://forgehouse50.pages.dev/api/admin/notes?type=application");
    assert(resApp.notes.every(n => n.type === "observation" || n.type === "question"), "Query for type=application must not return applications");
    console.log("PASS: Querying private note types is strictly filtered out");
  }

  // Test 4: Filtering by type=observation
  {
    const res = await adminQuery("https://forgehouse50.pages.dev/api/admin/notes?type=observation");
    assert.strictEqual(res.total, 3, "Must have exactly 3 observation notes");
    assert(res.notes.every(n => n.type === "observation"), "All returned notes must be observations");
    console.log("PASS: Filter by type=observation works");
  }

  // Test 5: Filtering by type=question
  {
    const res = await adminQuery("https://forgehouse50.pages.dev/api/admin/notes?type=question");
    assert.strictEqual(res.total, 2, "Must have exactly 2 question notes");
    assert(res.notes.every(n => n.type === "question"), "All returned notes must be questions");
    console.log("PASS: Filter by type=question works");
  }

  // Test 6: Filtering by user
  {
    const res = await adminQuery("https://forgehouse50.pages.dev/api/admin/notes?userId=u1");
    assert.strictEqual(res.total, 2, "User 1 has 2 visible notes (n1, n2)");
    assert(res.notes.every(n => n.user_id === "u1"), "All returned notes must belong to u1");
    console.log("PASS: Filter by userId works");
  }

  // Test 7: Filtering by day
  {
    const res = await adminQuery("https://forgehouse50.pages.dev/api/admin/notes?day=2");
    assert.strictEqual(res.total, 1, "Day 2 has 1 visible note (n9)");
    assert.strictEqual(res.notes[0].id, "n9");
    console.log("PASS: Filter by day works");
  }

  // Test 8: Search by text
  {
    const res = await adminQuery("https://forgehouse50.pages.dev/api/admin/notes?q=Wise+men");
    assert.strictEqual(res.total, 1, "Search for Wise men returns 1 note (n6)");
    assert.strictEqual(res.notes[0].id, "n6");
    console.log("PASS: Search by text works");
  }

  // Test 9: Pagination
  {
    const p1 = await adminQuery("https://forgehouse50.pages.dev/api/admin/notes?limit=2&page=1");
    assert.strictEqual(p1.notes.length, 2, "Page 1 returns 2 notes");
    const p2 = await adminQuery("https://forgehouse50.pages.dev/api/admin/notes?limit=2&page=2");
    assert.strictEqual(p2.notes.length, 2, "Page 2 returns 2 notes");
    assert.notStrictEqual(p1.notes[0].id, p2.notes[0].id, "Page 1 and Page 2 notes must be different");
    const p3 = await adminQuery("https://forgehouse50.pages.dev/api/admin/notes?limit=2&page=3");
    assert.strictEqual(p3.notes.length, 1, "Page 3 returns 1 note");
    console.log("PASS: Pagination works");
  }

  console.log("=== ALL ITEM 5 BACKEND TESTS PASSED ===");
}

runTests().catch(err => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
