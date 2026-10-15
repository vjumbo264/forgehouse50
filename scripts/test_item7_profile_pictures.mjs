import assert from "assert";
import { onRequestPut, onRequestDelete, detectMagicBytes } from "../functions/api/profile/picture.mjs";
import { onRequestGet as getPicture } from "../functions/api/users/[id]/picture.mjs";
import { onRequestPost as adminRemovePicture } from "../functions/api/admin/users/[id]/remove-picture.mjs";

console.log("=== Testing Item 7: Profile Pictures Backend Contract ===");

// 1. Magic bytes detection unit tests
const validJpegHeader = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
const validWebpHeader = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const fakePngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
const fakeText = new TextEncoder().encode("Hello world this is not an image at all!");

assert.strictEqual(detectMagicBytes(validJpegHeader), "image/jpeg");
assert.strictEqual(detectMagicBytes(validWebpHeader), "image/webp");
assert.strictEqual(detectMagicBytes(fakePngHeader), null);
assert.strictEqual(detectMagicBytes(fakeText), null);
console.log("PASS: Magic byte detection detects JPEG and WebP, rejects other types");

// In-memory mock DB
const dbState = {
  profiles: [
    { id: "u_member1", email: "member1@church.org", name: "Sarah", surname: "Adeyemi", role: "member" },
    { id: "u_member2", email: "member2@church.org", name: "David", surname: "Okonkwo", role: "member" },
    { id: "u_admin", email: "admin@church.org", name: "Pastor", surname: "Admin", role: "admin", is_admin_credential: true },
  ],
  sessions: [
    { id: "1111111111111111111111111111111111111111111111111111111111111111", user_id: "u_member1", expires_at: new Date(Date.now() + 86400000).toISOString() },
    { id: "2222222222222222222222222222222222222222222222222222222222222222", user_id: "u_member2", expires_at: new Date(Date.now() + 86400000).toISOString() },
  ],
  admin_sessions: [
    { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", admin_id: "u_admin", expires_at: new Date(Date.now() + 86400000).toISOString() },
  ],
  admin_credentials: [
    { id: "u_admin", username: "admin" }
  ],
  profile_pictures: new Map(), // user_id -> { user_id, content_type, bytes, version, updated_at }
  profile_picture_uploads: [], // { id, user_id, uploaded_at }
  admin_audit: [],
};

function createMockDB() {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes("FROM admin_sessions")) {
                const token = params[0];
                const s = dbState.admin_sessions.find(x => x.id === token);
                if (!s) return null;
                const a = dbState.admin_credentials.find(x => x.id === s.admin_id);
                return { session_id: s.id, expires_at: s.expires_at, admin_id: a.id, username: a.username };
              }
              if (sql.includes("FROM sessions s JOIN profiles p")) {
                const token = params[0];
                const s = dbState.sessions.find(x => x.id === token);
                if (!s) return null;
                const p = dbState.profiles.find(x => x.id === s.user_id);
                const pic = dbState.profile_pictures.get(p.id);
                return {
                  session_id: s.id,
                  expires_at: s.expires_at,
                  id: p.id,
                  email: p.email,
                  name: p.name,
                  surname: p.surname,
                  role: p.role,
                  email_verified: 1,
                  created_at: "2026-10-12T00:00:00Z",
                  picture_version: pic ? pic.version : null,
                };
              }
              if (sql.includes("SELECT version FROM profile_pictures WHERE user_id = ?")) {
                const uid = params[0];
                const pic = dbState.profile_pictures.get(uid);
                return pic ? { version: pic.version } : null;
              }
              if (sql.includes("SELECT content_type, bytes, version FROM profile_pictures WHERE user_id = ?")) {
                const uid = params[0];
                const pic = dbState.profile_pictures.get(uid);
                return pic ? { content_type: pic.content_type, bytes: pic.bytes, version: pic.version } : null;
              }
              if (sql.includes("SELECT COUNT(*) AS count, MIN(uploaded_at) AS oldest FROM profile_picture_uploads")) {
                const [uid, since] = params;
                const matches = dbState.profile_picture_uploads.filter(u => u.user_id === uid && u.uploaded_at >= since);
                const oldest = matches.length ? matches[0].uploaded_at : null;
                return { count: matches.length, oldest };
              }
              if (sql.includes("FROM profiles WHERE id = ?")) {
                const uid = params[0];
                const p = dbState.profiles.find(x => x.id === uid);
                return p ? { id: p.id, name: p.name, surname: p.surname, email: p.email } : null;
              }
              return null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              if (sql.includes("DELETE FROM profile_pictures WHERE user_id = ?")) {
                const uid = params[0];
                dbState.profile_pictures.delete(uid);
                return { success: true };
              }
              if (sql.includes("INSERT INTO admin_audit")) {
                const [id, admin_id, action, target_user_id, target_display_name, created_at] = params;
                dbState.admin_audit.push({ id, admin_id, action, target_user_id, target_display_name, created_at });
                return { success: true };
              }
              return { success: true };
            }
          };
        },
      };
    },
    async batch(stmts) {
      for (const s of stmts) {
        // execute binds
      }
    }
  };
}

// Custom mock DB batch handler for profile picture update
const mockEnv = {
  DB: {
    ...createMockDB(),
    async batch(stmts) {
      // simulate the two statements of PUT
      for (const st of stmts) {
        if (st._type === "insert_pic") {
          dbState.profile_pictures.set(st.uid, {
            user_id: st.uid,
            content_type: st.type,
            bytes: st.bytes,
            version: st.ver,
            updated_at: new Date().toISOString(),
          });
        } else if (st._type === "insert_upload") {
          dbState.profile_picture_uploads.push({
            id: st.id,
            user_id: st.uid,
            uploaded_at: new Date().toISOString(),
          });
        }
      }
    },
    prepare(sql) {
      return {
        bind(...params) {
          if (sql.includes("INSERT INTO profile_pictures")) {
            return {
              _type: "insert_pic",
              uid: params[0],
              type: params[1],
              bytes: params[2],
              ver: params[3],
            };
          }
          if (sql.includes("INSERT INTO profile_picture_uploads")) {
            return {
              _type: "insert_upload",
              id: params[0],
              uid: params[1],
            };
          }
          return createMockDB().prepare(sql).bind(...params);
        }
      };
    }
  }
};

async function runTests() {
  // Test 1: Reject unauthenticated PUT
  let res = await onRequestPut({
    request: new Request("https://app.test/api/profile/picture", { method: "PUT" }),
    env: mockEnv,
  });
  assert.strictEqual(res.status, 401);
  console.log("PASS: Unauthenticated PUT rejected (401)");

  // Test 2: Reject invalid content-type
  res = await onRequestPut({
    request: new Request("https://app.test/api/profile/picture", {
      method: "PUT",
      headers: { "Content-Type": "image/png", "Cookie": "fh50_session=1111111111111111111111111111111111111111111111111111111111111111" },
      body: fakePngHeader,
    }),
    env: mockEnv,
  });
  assert.strictEqual(res.status, 400);
  console.log("PASS: PNG Content-Type rejected (400)");

  // Test 3: Reject empty body
  res = await onRequestPut({
    request: new Request("https://app.test/api/profile/picture", {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "Cookie": "fh50_session=1111111111111111111111111111111111111111111111111111111111111111" },
      body: new Uint8Array(0),
    }),
    env: mockEnv,
  });
  assert.strictEqual(res.status, 400);
  console.log("PASS: Empty image payload rejected (400)");

  // Test 4: Reject oversized (>100KB)
  const hugeData = new Uint8Array(102401);
  hugeData.set(validJpegHeader, 0);
  res = await onRequestPut({
    request: new Request("https://app.test/api/profile/picture", {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "Cookie": "fh50_session=1111111111111111111111111111111111111111111111111111111111111111" },
      body: hugeData,
    }),
    env: mockEnv,
  });
  assert.strictEqual(res.status, 400);
  console.log("PASS: Oversized (>100KB) image payload rejected (400)");

  // Test 5: Reject invalid magic bytes with image/jpeg header
  res = await onRequestPut({
    request: new Request("https://app.test/api/profile/picture", {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "Cookie": "fh50_session=1111111111111111111111111111111111111111111111111111111111111111" },
      body: fakeText,
    }),
    env: mockEnv,
  });
  assert.strictEqual(res.status, 400);
  console.log("PASS: Fake image data rejected on magic bytes check (400)");

  // Test 6: Valid JPEG upload -> version 1
  res = await onRequestPut({
    request: new Request("https://app.test/api/profile/picture", {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "Cookie": "fh50_session=1111111111111111111111111111111111111111111111111111111111111111" },
      body: validJpegHeader,
    }),
    env: mockEnv,
  });
  assert.strictEqual(res.status, 200);
  let data = await res.json();
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.version, 1);
  assert.strictEqual(dbState.profile_pictures.get("u_member1")?.version, 1);
  console.log("PASS: Valid JPEG uploaded, returns version 1");

  // Test 7: Valid WebP update -> version 2
  res = await onRequestPut({
    request: new Request("https://app.test/api/profile/picture", {
      method: "PUT",
      headers: { "Content-Type": "image/webp", "Cookie": "fh50_session=1111111111111111111111111111111111111111111111111111111111111111" },
      body: validWebpHeader,
    }),
    env: mockEnv,
  });
  assert.strictEqual(res.status, 200);
  data = await res.json();
  assert.strictEqual(data.version, 2);
  assert.strictEqual(dbState.profile_pictures.get("u_member1")?.version, 2);
  console.log("PASS: Valid WebP replaces picture, bumps version to 2");

  // Test 8: Unauthenticated GET picture rejected (401)
  res = await getPicture({
    request: new Request("https://app.test/api/users/u_member1/picture?v=2"),
    env: mockEnv,
    params: { id: "u_member1" },
  });
  assert.strictEqual(res.status, 401);
  console.log("PASS: Unauthenticated GET /api/users/:id/picture rejected (401)");

  // Test 9: Authenticated GET picture returns image bytes and headers
  res = await getPicture({
    request: new Request("https://app.test/api/users/u_member1/picture?v=2", {
      headers: { "Cookie": "fh50_session=2222222222222222222222222222222222222222222222222222222222222222" }, // another signed-in member
    }),
    env: mockEnv,
    params: { id: "u_member1" },
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get("Content-Type"), "image/webp");
  assert.strictEqual(res.headers.get("Cache-Control"), "private, max-age=86400, immutable");
  const etag = res.headers.get("ETag");
  assert.ok(etag && etag.includes("pic-u_member1-2"));
  console.log("PASS: Authenticated GET returns image bytes with ETag and immutable Cache-Control");

  // Test 10: ETag matching returns 304 Not Modified
  res = await getPicture({
    request: new Request("https://app.test/api/users/u_member1/picture?v=2", {
      headers: { "Cookie": "fh50_session=2222222222222222222222222222222222222222222222222222222222222222", "If-None-Match": etag },
    }),
    env: mockEnv,
    params: { id: "u_member1" },
  });
  assert.strictEqual(res.status, 304);
  console.log("PASS: Conditional GET with matching ETag returns 304 Not Modified");

  // Test 11: Rate limiting (5 uploads limit)
  for (let i = 0; i < 3; i++) {
    await onRequestPut({
      request: new Request("https://app.test/api/profile/picture", {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg", "Cookie": "fh50_session=1111111111111111111111111111111111111111111111111111111111111111" },
        body: validJpegHeader,
      }),
      env: mockEnv,
    });
  }
  // 6th upload must be blocked with 429
  res = await onRequestPut({
    request: new Request("https://app.test/api/profile/picture", {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "Cookie": "fh50_session=1111111111111111111111111111111111111111111111111111111111111111" },
      body: validJpegHeader,
    }),
    env: mockEnv,
  });
  assert.strictEqual(res.status, 429);
  const rateLimitData = await res.json();
  assert.ok(rateLimitData.retry_after_minutes > 0);
  console.log("PASS: 6th upload in 24 hours rate-limited (429 with retry_after_minutes)");

  // Test 12: Admin removal of profile picture
  res = await adminRemovePicture({
    request: new Request("https://app.test/api/admin/users/u_member1/remove-picture", {
      method: "POST",
      headers: { "Cookie": "fh50_session=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    }),
    env: mockEnv,
    params: { id: "u_member1" },
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(dbState.profile_pictures.has("u_member1"), false);
  const auditRow = dbState.admin_audit.find(a => a.action === "remove_picture" && a.target_user_id === "u_member1");
  assert.ok(auditRow, "admin_audit record must be created");
  console.log("PASS: Admin removal deletes picture and writes admin_audit entry");

  // Test 13: DELETE /api/profile/picture removes picture
  // Re-upload first
  dbState.profile_picture_uploads = []; // clear rate limit for member 2
  await onRequestPut({
    request: new Request("https://app.test/api/profile/picture", {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "Cookie": "fh50_session=2222222222222222222222222222222222222222222222222222222222222222" },
      body: validJpegHeader,
    }),
    env: mockEnv,
  });
  assert.strictEqual(dbState.profile_pictures.has("u_member2"), true);

  res = await onRequestDelete({
    request: new Request("https://app.test/api/profile/picture", {
      method: "DELETE",
      headers: { "Cookie": "fh50_session=2222222222222222222222222222222222222222222222222222222222222222" },
    }),
    env: mockEnv,
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(dbState.profile_pictures.has("u_member2"), false);
  console.log("PASS: DELETE /api/profile/picture deletes user picture successfully");

  console.log("=== ALL ITEM 7a BACKEND TESTS PASSED SUCCESSFULLY ===");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
