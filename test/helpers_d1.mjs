import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createTestD1(extraMigrations = ['migrations/reading_time_v1.sql']) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  const schemaSql = fs.readFileSync(path.resolve(__dirname, '..', 'schema.sql'), 'utf8');
  sqlite.exec(schemaSql);
  for (const mig of extraMigrations) {
    const migSql = fs.readFileSync(path.resolve(__dirname, '..', mig), 'utf8');
    for (const stmt of migSql.split(';').map(s => s.trim()).filter(Boolean)) {
      try { sqlite.exec(stmt + ';'); } catch (e) { if (!String(e.message).includes('duplicate column')) throw e; }
    }
  }

  function makeStmt(sql, bound = []) {
    return {
      bind(...args) {
        return makeStmt(sql, args.map(v => (v === undefined ? null : v)));
      },
      async first(colName) {
        const stmt = sqlite.prepare(sql);
        const row = stmt.get(...bound) ?? null;
        if (!row) return null;
        return colName ? row[colName] : row;
      },
      async all() {
        const stmt = sqlite.prepare(sql);
        const results = stmt.all(...bound);
        return { results, success: true, meta: {} };
      },
      async run() {
        const stmt = sqlite.prepare(sql);
        const info = stmt.run(...bound);
        return {
          success: true,
          meta: {
            changes: Number(info.changes ?? 0),
            last_row_id: Number(info.lastInsertRowid ?? 0),
          },
        };
      },
    };
  }

  return {
    sqlite,
    prepare(sql) {
      return makeStmt(sql);
    },
    async batch(stmts) {
      const out = [];
      for (const s of stmts) {
        out.push(await s.run());
      }
      return out;
    },
    exec(sql) {
      sqlite.exec(sql);
    },
  };
}

import { generatePlan } from '../functions/lib/calendar.mjs';

export function seedCanonicalPlan(db) {
  for (const day of generatePlan()) {
    db.exec(
      `INSERT OR IGNORE INTO reading_days (day_number, date, label) VALUES (${day.day_number}, '${day.date}', 'Day ${day.day_number}');`
    );
    for (const a of day.assignments) {
      db.exec(
        `INSERT INTO reading_assignments (day_number, book, chapter_start, chapter_end, chapter_count, est_minutes)
         VALUES (${day.day_number}, '${a.book}', ${a.chapter_start}, ${a.chapter_end}, ${a.chapter_count}, 20);`
      );
    }
  }
}
