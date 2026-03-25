import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Resolve to packages/server/data/auto-spec-test.db */
const DATA_DIR = resolve(__dirname, '..', '..', 'data');
const DB_PATH = resolve(DATA_DIR, 'auto-spec-test.db');

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const db: DatabaseType = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
// Enable foreign key constraint enforcement
db.pragma('foreign_keys = ON');

/**
 * Returns the singleton database instance.
 */
export function getDb(): Database.Database {
  return db;
}

export { db };
export default db;
