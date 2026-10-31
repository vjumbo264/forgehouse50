import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createTestD1(extraMigrations = []) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  const schemaSql = fs.readFileSync(path.resolve(__dirname, '..', 'schema.sql'), 'utf8');
  sqlite.exec(schemaSql);
  for (const mig of extraMigrations) {
    const migSql = fs.readFileSync(path.resolve(__dirname, '..', mig), 'utf8');
    sqlite.exec(migSql);
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
