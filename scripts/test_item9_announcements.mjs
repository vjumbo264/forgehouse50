import assert from "assert";
import { onRequestGet as getLatest, onRequestGet as getList } from "../functions/api/announcements/index.mjs";
import { onRequestGet as getLatestSingle } from "../functions/api/announcements/latest.mjs";
import { onRequestPost as createAnnouncement, onRequestGet as adminList } from "../functions/api/admin/announcements/index.mjs";

console.log("=== Testing Item 9: Announcements API ===");

class MockAnnounceDB {
  constructor() {
    this.announcements = [];
    this.admin_audit = [];
  }

  prepare(sql) {
    const db = this;
    return {
      bind(...params) {
        return {
          async run() {
            if (sql.includes("INSERT INTO announcements")) {
              const [id, title, body, created_by, status, created_at, updated_at] = params;
              db.announcements.push({ id, title, body, created_by, status, created_at, updated_at });
              return { meta: { changes: 1 } };
            }
            if (sql.includes("INSERT INTO admin_audit")) {
              db.admin_audit.push(params);
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          },
          async first() {
            if (sql.includes("SELECT id, title, body, created_at FROM announcements WHERE status = 'active'")) {
              const active = db.announcements.filter(a => a.status === 'active');
              return active[active.length - 1] || null;
            }
            return null;
          },
          async all() {
            const active = db.announcements.filter(a => a.status === 'active');
            return { results: active.slice().reverse() };
          }
        };
      }
    };
  }
}

async function runTests() {
  const db = new MockAnnounceDB();
  const env = { DB: db };

  // 1. Initially empty
  const latest1 = await getLatestSingle({ request: { url: "http://localhost/api/announcements/latest" }, env });
  const d1 = await latest1.json();
  assert.strictEqual(d1.announcement, null);
  console.log("PASS: Latest announcement is null when none exist");

  // 2. Add announcement
  db.announcements.push({
    id: "a1",
    title: "Mid-programme Fellowship",
    body: "Join us this Saturday for a reading fellowship and Q&A session.",
    created_by: "u_admin",
    status: "active",
    created_at: "2026-10-17T10:00:00Z",
    updated_at: "2026-10-17T10:00:00Z"
  });

  const latest2 = await getLatestSingle({ request: { url: "http://localhost/api/announcements/latest" }, env });
  const d2 = await latest2.json();
  assert.ok(d2.announcement);
  assert.strictEqual(d2.announcement.title, "Mid-programme Fellowship");
  console.log("PASS: Latest announcement returns active announcement");

  // 3. List
  const list = await getList({ request: { url: "http://localhost/api/announcements" }, env });
  const listData = await list.json();
  assert.strictEqual(listData.announcements.length, 1);
  console.log("PASS: Announcements list returns items");

  console.log("=== ALL ITEM 9 ANNOUNCEMENT TESTS PASSED ===");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
