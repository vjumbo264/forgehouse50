import assert from "assert";
import { onRequestPost as forgotPassword } from "../functions/api/auth/forgot_password.mjs";
import { onRequestPost as resetPassword } from "../functions/api/auth/reset_password.mjs";
import { hashPassword, verifyPassword } from "../functions/lib/auth.mjs";

console.log("=== TEST SUITE: Item 3 — Forgot Password & Reset Password Backend ===");

// Mock In-Memory D1 Database for testing
class MockD1 {
  constructor() {
    this.profiles = [
      { id: "user_test_1", email: "tester@example.com", name: "Tester One", password_hash: "", email_verified: 1 }
    ];
    this.otp_codes = [];
    this.sessions = [];
  }

  prepare(sql) {
    const db = this;
    return {
      bind(...params) {
        return {
          async first() {
            if (sql.includes("FROM profiles WHERE email = ?")) {
              const email = params[0];
              return db.profiles.find(p => p.email === email) || null;
            }
            if (sql.includes("FROM otp_codes")) {
              const userId = params[0];
              const list = db.otp_codes.filter(o => o.user_id === userId && o.purpose === "password_reset");
              return list[list.length - 1] || null;
            }
            return null;
          },
          async run() {
            if (sql.includes("DELETE FROM otp_codes WHERE user_id = ? AND purpose = 'password_reset'")) {
              const userId = params[0];
              db.otp_codes = db.otp_codes.filter(o => !(o.user_id === userId && o.purpose === "password_reset"));
              return { success: true };
            }
            if (sql.includes("INSERT INTO otp_codes")) {
              const purpose = sql.includes("'password_reset'") ? "password_reset" : params[3];
              const expires_at = sql.includes("'password_reset'") ? params[3] : params[4];
              db.otp_codes.push({
                id: params[0],
                user_id: params[1],
                code: params[2],
                purpose,
                expires_at,
                attempts: 0,
                consumed_at: null
              });
              return { success: true };
            }
            if (sql.includes("UPDATE otp_codes SET attempts = attempts + 1")) {
              const id = params[0];
              const otp = db.otp_codes.find(o => o.id === id);
              if (otp) otp.attempts = (otp.attempts || 0) + 1;
              return { success: true };
            }
            if (sql.includes("UPDATE otp_codes SET consumed_at = ?")) {
              const [consumed_at, id] = params;
              const otp = db.otp_codes.find(o => o.id === id);
              if (otp) otp.consumed_at = consumed_at;
              return { success: true };
            }
            if (sql.includes("UPDATE profiles SET password_hash = ?")) {
              const [hash, updated_at, id] = params;
              const p = db.profiles.find(u => u.id === id);
              if (p) {
                p.password_hash = hash;
                p.email_verified = 1;
                p.updated_at = updated_at;
              }
              return { success: true };
            }
            if (sql.includes("DELETE FROM sessions WHERE user_id = ?")) {
              const userId = params[0];
              db.sessions = db.sessions.filter(s => s.user_id !== userId);
              return { success: true };
            }
            if (sql.includes("INSERT INTO sessions")) {
              // (id, user_id, expires_at, user_agent)
              db.sessions.push({ id: params[0], user_id: params[1], expires_at: params[2], user_agent: params[3] });
              return { success: true };
            }
            return { success: true };
          }
        };
      }
    };
  }

  async batch(stmts) {
    const results = [];
    for (const s of stmts) {
      results.push(await s.run());
    }
    return results;
  }
}

async function runTests() {
  const db = new MockD1();
  const env = { DB: db };

  // Set initial password
  db.profiles[0].password_hash = await hashPassword("OldPassword123!");

  // Test 1: Invalid email format
  {
    const req = new Request("http://localhost/api/auth/forgot_password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "invalid-email" })
    });
    const res = await forgotPassword({ request: req, env });
    assert.strictEqual(res.status, 400);
    console.log("PASS: forgot_password rejects invalid email");
  }

  // Test 2: Valid email triggers OTP generation
  {
    const req = new Request("http://localhost/api/auth/forgot_password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "tester@example.com" })
    });
    const res = await forgotPassword({ request: req, env });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(db.otp_codes.length, 1);
    assert.strictEqual(db.otp_codes[0].purpose, "password_reset");
    assert.match(db.otp_codes[0].code, /^\d{6}$/);
    console.log("PASS: forgot_password creates 6-digit OTP code");
  }

  const generatedCode = db.otp_codes[0].code;

  // Test 3: Reset password with short password rejected
  {
    const req = new Request("http://localhost/api/auth/reset_password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "tester@example.com", code: generatedCode, new_password: "short" })
    });
    const res = await resetPassword({ request: req, env });
    assert.strictEqual(res.status, 400);
    console.log("PASS: reset_password rejects short password");
  }

  // Test 4: Reset password with wrong code increments attempt counter
  {
    const req = new Request("http://localhost/api/auth/reset_password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "tester@example.com", code: "000000", new_password: "NewPassword123!" })
    });
    const res = await resetPassword({ request: req, env });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(db.otp_codes[0].attempts, 1);
    console.log("PASS: reset_password rejects incorrect code and increments attempts");
  }

  // Test 5: Reset password with correct code succeeds and logs user in
  {
    const req = new Request("http://localhost/api/auth/reset_password", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "TestBrowser" },
      body: JSON.stringify({ email: "tester@example.com", code: generatedCode, new_password: "NewPassword123!" })
    });
    const res = await resetPassword({ request: req, env });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(db.otp_codes[0].consumed_at !== null, true);
    assert.strictEqual(db.sessions.length, 1);
    
    // Verify new password hashes correctly
    const validNew = await verifyPassword("NewPassword123!", db.profiles[0].password_hash);
    assert.strictEqual(validNew, true);
    const invalidOld = await verifyPassword("OldPassword123!", db.profiles[0].password_hash);
    assert.strictEqual(invalidOld, false);
    console.log("PASS: reset_password successfully updates password hash and creates session");
  }

  console.log("\nAll forgot password backend tests passed!");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
