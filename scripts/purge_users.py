#!/usr/bin/env python3
"""
ForgeHouse 50 — cascading user purge (migration_brevo_v1 / task-m07).

Deletes the listed users plus every row that references them across all
per-user child tables, in FK-safe child->parent order, through the
Cloudflare D1 REST API. Each child table already carries ON DELETE CASCADE
on its user_id FK, but explicit per-table DELETEs are issued so the audit
output records exactly how many rows each table lost. A post-delete orphan
check per table proves nothing was left behind.

This script is the reusable record of the deletion routine. The target
list is supplied as a JSON file (kept OUT of git — it contains user
emails; the audit trail with emails lives in BUILD_STATE.json notes) with
this shape:

  {
    "promote_to_admin": ["<profile id>", ...],
    "delete": [{"id": "<profile id>", "email": "<email>"}, ...]
  }

Usage:
  CF_API_TOKEN=... CF_ACCOUNT_ID=... D1_DATABASE_ID=... \
      python3 scripts/purge_users.py /path/to/targets.json
"""

import json
import os
import sys
import urllib.request

CHILD_TABLES = [
    "reading_progress",
    "audio_progress",
    "notes",
    "bookmarks",
    "highlights",
    "user_badges",
    "points",
    "sessions",
    "otp_codes",
    "leaderboard_snapshots",
]

API = "https://api.cloudflare.com/client/v4/accounts/{acct}/d1/database/{db}/query"


def d1(sql, params=()):
    token = os.environ["CF_API_TOKEN"]
    url = API.format(acct=os.environ["CF_ACCOUNT_ID"], db=os.environ["D1_DATABASE_ID"])
    body = json.dumps({"sql": sql, "params": list(params)}).encode()
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        payload = json.load(resp)
    if not payload.get("success"):
        raise RuntimeError(f"D1 query failed: {sql!r} -> {payload.get('errors')}")
    return payload["result"][0]["results"]


def count(table, user_id):
    rows = d1(f"SELECT COUNT(*) AS c FROM {table} WHERE user_id = ?", [user_id])
    return rows[0]["c"] if rows else 0


def main():
    with open(sys.argv[1]) as fh:
        targets = json.load(fh)

    audit = {"promoted_to_admin": [], "deleted": [], "errors": []}

    for uid in targets.get("promote_to_admin", []):
        d1("UPDATE profiles SET role = 'admin' WHERE id = ?", [uid])
        audit["promoted_to_admin"].append(uid)

    for entry in targets.get("delete", []):
        uid, email = entry["id"], entry["email"]
        record = {"id": uid, "email": email, "rows_deleted_by_table": {}, "orphans_after": {}}
        try:
            for t in CHILD_TABLES:
                record["rows_deleted_by_table"][t] = count(t, uid)
            for t in CHILD_TABLES:
                d1(f"DELETE FROM {t} WHERE user_id = ?", [uid])
            d1("DELETE FROM profiles WHERE id = ?", [uid])
            for t in CHILD_TABLES:
                leftover = count(t, uid)
                record["orphans_after"][t] = leftover
                if leftover:
                    audit["errors"].append({"id": uid, "error": f"{t}: {leftover} rows remain"})
            record["profile_gone"] = not d1("SELECT 1 FROM profiles WHERE id = ?", [uid])
            if not record["profile_gone"]:
                audit["errors"].append({"id": uid, "error": "profile row still present"})
        except Exception as exc:  # noqa: BLE001
            record["error"] = str(exc)
            audit["errors"].append({"id": uid, "error": str(exc)})
        audit["deleted"].append(record)

    print(json.dumps(audit, indent=2))
    if audit["errors"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
