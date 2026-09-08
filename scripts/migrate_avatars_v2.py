#!/usr/bin/env python3
"""One-shot D1 migration (pwa_and_avatars_v1 Part B / task-w08):
remap every profiles.avatar_id that is NULL or not in the new illustration
set (avatar-01..avatar-41) to a valid new id, spread deterministically by
user id hash so users do not all collapse onto the default. Idempotent:
re-running leaves already-valid ids untouched.

Usage: CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... python3 scripts/migrate_avatars_v2.py [--apply]
Without --apply it only reports what would change.
"""
import hashlib, json, os, sys, urllib.request

DB_UUID = "351aca36-14e4-4c6f-8e13-127caae5b72f"
NEW_IDS = [f"avatar-{i:02d}" for i in range(1, 42)]  # avatar-01..avatar-41
API = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CLOUDFLARE_ACCOUNT_ID']}/d1/database/{DB_UUID}/query"

def q(sql, params=()):
    req = urllib.request.Request(API, data=json.dumps({"sql": sql, "params": list(params)}).encode(),
        headers={"Authorization": f"Bearer {os.environ['CLOUDFLARE_API_TOKEN']}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        body = json.load(r)
    if not body.get("success"):
        raise SystemExit(f"D1 query failed: {body}")
    return body["result"][0]["results"]

def main():
    apply = "--apply" in sys.argv
    rows = q("SELECT id, email, avatar_id FROM profiles")
    stale = [r for r in rows if r.get("avatar_id") not in NEW_IDS]
    print(f"profiles={len(rows)} stale_avatar_ids={len(stale)}")
    for r in stale:
        old = r.get("avatar_id")
        new = NEW_IDS[int(hashlib.sha256(r["id"].encode()).hexdigest(), 16) % len(NEW_IDS)]
        print(f"  {r['email']:<40} {old!r} -> {new}")
        if apply:
            q("UPDATE profiles SET avatar_id = ? WHERE id = ?", (new, r["id"]))
    if apply:
        after = q("SELECT COUNT(*) AS n FROM profiles WHERE avatar_id IS NULL OR avatar_id NOT IN (" +
                  ",".join("?" * len(NEW_IDS)) + ")", NEW_IDS)
        print(f"post-migration dangling count = {after[0]['n']} (expect 0)")
    else:
        print("dry-run only; pass --apply to write")

if __name__ == "__main__":
    main()
