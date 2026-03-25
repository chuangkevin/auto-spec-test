import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = resolve(__dirname, 'migrations');

/**
 * Run all pending SQL migrations found in src/db/migrations/.
 *
 * Migrations are tracked in a `_migrations` table and executed in
 * filename-sort order inside a transaction.
 */
export function runMigrations(): void {
  // Ensure the tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT    NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Collect .sql files sorted by name
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied = new Set(
    db
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((row: any) => row.name),
  );

  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    return;
  }

  const insertStmt = db.prepare(
    'INSERT INTO _migrations (name) VALUES (?)',
  );

  const applyAll = db.transaction(() => {
    for (const file of pending) {
      const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8');
      db.exec(sql);
      insertStmt.run(file);
      console.log(`[migrate] applied ${file}`);
    }
  });

  applyAll();
}
