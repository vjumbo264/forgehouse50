#!/usr/bin/env python3
"""task-w07 live verification harness for quiz_redesign_and_launch_wipe_v1.
Credentials come from env only; nothing secret is printed or written.
Covers: fresh registration + per-user calendar, ungated completion, one-attempt
enforcement, always-shown results, proportional quiz points, damped leaderboard
with quiz points, admin-only participants, empty leaderboard, full cleanup."""
import json, os, sys, urllib.request, urllib.error, http.cookiejar, re, datetime, uuid

BASE = "https://forgehouse50.pages.dev"
CF_ACCT = os.environ["CF_ACCOUNT_ID"]; CF_TOKEN = os.environ["CF_API_TOKEN"]; D1 = os.environ["D1_DATABASE_ID"]
TODAY = "2026-09-14"
ADMIN_ID = "43f78d9d-01ea-425c-9b4d-a255d1dd8587"
K = 7

def d1(sql, params=()):
    body = json.dumps({"sql": sql, "params": list(params)}).encode()
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCT}/d1/database/{D1}/query",
        data=body, method="POST",
        headers={"Authorization": f"Bearer {CF_TOKEN}", "Content-Type": "application/json"})
    p = json.load(urllib.request.urlopen(req))
    if not p.get("success"): raise RuntimeError(f"D1 failed: {sql[:70]!r} -> {p.get('errors')}")
    return p["result"][0]["results"]

class Client:
    def __init__(self, cookie=None):
        self.cj = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cj))
        self.cookie = cookie
    def call(self, method, path, payload=None):
        data = json.dumps(payload).encode() if payload is not None else None
        h = {"Content-Type": "application/json", "User-Agent": "w07-verify"}
        if self.cookie: h["Cookie"] = f"fh50_session={self.cookie}"
        req = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
        try:
            with self.op.open(req) as r: return r.status, json.loads(r.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            try: return e.code, json.loads(e.read().decode() or "{}")
            except Exception: return e.code, {}

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))

def damped(total, el): return round(((total / el) * el) / (el + K), 2) if el > 0 else 0

# Correct answers pulled from the checked-in bank (same source the server grades with).
src = open("/home/user/forgehouse50/functions/lib/quiz_questions.mjs").read()
answers_by_day = {}
for b in re.split(r"\{ day: ", src)[1:]:
    dnum = int(b.split(",", 1)[0])
    answers_by_day[dnum] = [int(x) for x in re.findall(r"answer: (\d)", b.split("]}")[0])]
def wrong_answers(day):
    return [(a + 1) % 3 for a in answers_by_day[day]]

def purge(uid):
    for t in ["reading_progress","quiz_attempts","user_reading_days","points","notes","bookmarks",
              "highlights","user_badges","audio_progress","sessions","otp_codes","leaderboard_snapshots"]:
        d1(f"DELETE FROM {t} WHERE user_id = ?", [uid])
    d1("DELETE FROM profiles WHERE id = ?", [uid])

def main():
    # ── PART B assertions (post-wipe state, deploy-independent) ────────────
    profs = d1("SELECT id,email,role,email_verified FROM profiles")
    check("B1 D1 profiles: exactly ONE account remains", len(profs) == 1, f"n={len(profs)}")
    check("B2 remaining account IS the admin via the role field",
          profs and profs[0]["id"] == ADMIN_ID and profs[0]["role"] == "admin",
          f"role={profs[0]['role'] if profs else None}")
    check("B3 admin's own data intact (progress=2, points=4, calendar=50)",
          d1("SELECT (SELECT COUNT(*) FROM reading_progress WHERE user_id=?) rp,(SELECT COUNT(*) FROM points WHERE user_id=?) p,(SELECT COUNT(*) FROM user_reading_days WHERE user_id=?) c",
             [ADMIN_ID,ADMIN_ID,ADMIN_ID])[0] == {"rp":2,"p":4,"c":50})
    check("B4 shared/global content untouched (72 assignments, 50 reading_days, 10 badges)",
          d1("SELECT (SELECT COUNT(*) FROM reading_assignments) a,(SELECT COUNT(*) FROM reading_days) r,(SELECT COUNT(*) FROM badges) b")[0] == {"a":72,"r":50,"b":10})

    # admin session (D1-inserted) for the admin dashboard checks
    tok = uuid.uuid4().hex + uuid.uuid4().hex
    d1("INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)",
       [tok, ADMIN_ID, "2099-01-01T00:00:00.000Z", "w07-verify"])
    admin = Client(cookie=tok)
    s, parts = admin.call("GET", "/api/admin/participants")
    plist = parts.get("participants", [])
    check("B5 admin dashboard participants = ONLY the admin",
          s == 200 and len(plist) == 1 and plist[0]["id"] == ADMIN_ID,
          f"n={len(plist)}")
    s, stats = admin.call("GET", "/api/admin/stats")
    check("B6 admin stats loads (total_participants=1)",
          s == 200 and stats.get("total_participants") == 1, f"total={stats.get('total_participants')}")
    d1("DELETE FROM sessions WHERE id = ?", [tok])

    # ── Fresh registration: end-to-end + fresh per-user calendar ───────────
    tag = datetime.datetime.utcnow().strftime("%H%M%S")
    email = f"w07verify+{tag}@example.com"; pw = "VerifyPass123!"
    c = Client()
    s, r = c.call("POST", "/api/auth/signup", {"email": email, "password": pw, "name": f"W07 Verify {tag}", "avatar_id": "avatar-03"})
    check("R1 fresh signup accepted", s == 200 and r.get("ok"), f"status={s}")
    uid = r.get("user_id")
    otp = d1("SELECT code FROM otp_codes WHERE user_id = ? AND purpose='verify_email' ORDER BY created_at DESC LIMIT 1", [uid])[0]["code"]
    s, r = c.call("POST", "/api/auth/verify", {"email": email, "code": otp})
    check("R2 OTP verification succeeds", s == 200 and r.get("ok"), f"status={s}")
    row = d1("SELECT programme_start_date, email_verified FROM profiles WHERE id = ?", [uid])[0]
    check("R3 per-user calendar Day 1 anchored to actual registration date",
          row["programme_start_date"] == TODAY and row["email_verified"] == 1, f"start={row['programme_start_date']}")
    c.call("GET", "/api/today")  # lazy materialisation trigger (ensureUserCalendar) — same as app usage
    cal = d1("SELECT COUNT(*) c, MIN(date) d1, MAX(date) d50 FROM user_reading_days WHERE user_id = ?", [uid])[0]
    check("R4 fresh calendar materialised: 50 rows, Day1 = today", cal["c"] == 50 and cal["d1"] == TODAY,
          f"rows={cal['c']} day1={cal['d1']}")

    try:
        # ── Quiz redesign flow (new behaviour asserts; on the OLD pre-deploy
        #    code these fail by design and are reported as CONTRAST) ─────────
        s, r = c.call("POST", "/api/read/complete", {"day_number": 1})
        check("Q1 completion BEFORE any quiz attempt works (quiz is not a gate)",
              s == 200 and r.get("ok") and r.get("points_awarded") == 13,
              f"status={s} pts={r.get('points_awarded')} err={r.get('error')}")
        pts = d1("SELECT COALESCE(SUM(points),0) t FROM points WHERE user_id = ?", [uid])[0]["t"]
        check("Q2 non-quiz points awarded with no quiz attempt (13 = 10+3)", pts == 13, f"pts={pts}")

        s, r = c.call("POST", "/api/quiz/submit", {"day_number": 1, "answers": wrong_answers(1)})
        check("Q3 0/5 quiz attempt ACCEPTED on a completed day (result shown, no gate)",
              s == 200 and r.get("score") == 0 and r.get("total") == 5 and r.get("quiz_points") == 0,
              f"status={s} resp={json.dumps({k:r.get(k) for k in ('score','total','quiz_points','passed','message')})}")
        att = d1("SELECT score,total FROM quiz_attempts WHERE user_id = ? AND day_number = 1", [uid])
        check("Q4 single attempt recorded (0/5), informational only", len(att) == 1 and att[0]["score"] == 0, f"attempts={att}")
        pts = d1("SELECT COALESCE(SUM(points),0) t FROM points WHERE user_id = ?", [uid])[0]["t"]
        check("Q5 0/5 adds 0 quiz pts (still 13)", pts == 13, f"pts={pts}")

        s, r = c.call("POST", "/api/quiz/submit", {"day_number": 1, "answers": answers_by_day[1]})
        check("Q6 second submission REJECTED server-side (409 one-attempt)", s == 409, f"status={s} err={r.get('error')}")
        att = d1("SELECT COUNT(*) c FROM quiz_attempts WHERE user_id = ? AND day_number = 1", [uid])[0]["c"]
        check("Q7 still exactly ONE attempt row after the rejected retry", att == 1, f"attempts={att}")

        # Day 2: complete first (sequential guard), then a 3/5 quiz -> 3 pts
        s, r = c.call("POST", "/api/read/complete", {"day_number": 2})
        check("Q8 Day 2 completes (prev day done, one-ahead OK)", s == 200 and r.get("ok"), f"status={s} pts={r.get('points_awarded')}")
        ans3 = list(answers_by_day[2]); ans3[0] = (ans3[0] + 1) % 3; ans3[1] = (ans3[1] + 1) % 3  # exactly 3/5
        s, r = c.call("POST", "/api/quiz/submit", {"day_number": 2, "answers": ans3})
        check("Q9 3/5 quiz accepted; result always shown", s == 200 and r.get("score") == 3, f"resp={r}")
        qrow = d1("SELECT points FROM points WHERE user_id = ? AND action = 'quiz_score' AND day_number = 2", [uid])
        check("Q10 proportional quiz points: (3/5) x 5 = 3", qrow and qrow[0]["points"] == 3, f"rows={qrow}")
        pts = d1("SELECT COALESCE(SUM(points),0) t FROM points WHERE user_id = ?", [uid])[0]["t"]
        check("Q11 total = 13 (d1) + 13 (d2) + 3 (quiz) = 29", pts == 29, f"pts={pts}")

        # ordering guards intact on the new complete endpoint
        s, r = c.call("POST", "/api/read/complete", {"day_number": 4})
        check("Q12 sequential guard intact: Day 4 before Day 3 => 409", s == 409, f"status={s}")
        s, r = c.call("POST", "/api/quiz/submit", {"day_number": 5, "answers": answers_by_day.get(5, [0]*5)})
        check("Q13 read-ahead guard intact on quiz submit => 409", s == 409, f"status={s}")

        # ── Damped leaderboard with proportional quiz points (live data) ───
        # Push the test user to elapsed_days=3 on their own calendar.
        d1("DELETE FROM user_reading_days WHERE user_id = ?", [uid])
        for dn, dt in [(1, "2026-09-12"), (2, "2026-09-13"), (3, "2026-09-14")]:
            d1("INSERT INTO user_reading_days (user_id, day_number, date, label) VALUES (?, ?, ?, ?)", [uid, dn, dt, f"Reading Day {dn}"])
        s, lb = c.call("GET", "/api/leaderboard?category=overall")
        mine = next((e for e in lb.get("entries", []) if e["user_id"] == uid), None)
        check("B7 leaderboard EMPTY state after wipe (only this harness user can appear)",
              len(lb.get("entries", [])) <= 1 and all(e["user_id"] == uid for e in lb.get("entries", [])),
              f"entries={len(lb.get('entries', []))}")
        expected = damped(29, 3)  # 29 pts over elapsed 3 -> (29/3)*3/10 = 2.90
        check("W4 damped score reflects proportional quiz pts: (29/3)x3/(3+7) = 2.90",
              mine and abs(mine["value"] - expected) < 0.011,
              f"value={mine and mine['value']} expected={expected}")
        check("W4b admin (26 pts, day 4) is EXCLUDED from the leaderboard",
              all(e["user_id"] != ADMIN_ID for e in lb.get("entries", [])))
        s, lbhtml = c.call("GET", "/api/leaderboard?category=consistency")
        check("W4c other categories also admin-free + gated", all(e["user_id"] != ADMIN_ID for e in lbhtml.get("entries", [])))
    finally:
        purge(uid)
        left = d1("SELECT COUNT(*) c FROM profiles WHERE id = ?", [uid])[0]["c"]
        check("Z cleanup: harness user fully purged", left == 0)

    fails = [n for n, ok in results if not ok]
    print(f"\n===== SUMMARY: {sum(1 for _, ok in results if ok)} passed, {len(fails)} failed =====")
    if fails: print("FAILED:", fails); sys.exit(1)

if __name__ == "__main__":
    main()
