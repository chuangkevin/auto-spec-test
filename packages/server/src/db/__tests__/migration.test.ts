import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the connection module so it never touches the real DB file.
// We use a simple in-memory store to simulate SQLite behaviour.
const tables = new Map<string, any[]>();
let execHistory: string[] = [];

function resetStore() {
  tables.clear();
  execHistory = [];
  tables.set('_migrations', []);
}

const mockPrepare = vi.fn((sql: string) => {
  return {
    all: () => {
      if (sql.includes('SELECT name FROM _migrations')) {
        return tables.get('_migrations') ?? [];
      }
      if (sql.includes("sqlite_master")) {
        // Return table names from execHistory
        const created: string[] = [];
        for (const s of execHistory) {
          const match = s.match(/CREATE TABLE IF NOT EXISTS (\w+)/gi);
          if (match) {
            for (const m of match) {
              const name = m.replace(/CREATE TABLE IF NOT EXISTS /i, '');
              created.push(name);
            }
          }
        }
        return created.map((n) => ({ name: n }));
      }
      return [];
    },
    run: (...args: any[]) => {
      if (sql.includes('INSERT INTO _migrations')) {
        tables.get('_migrations')!.push({ name: args[0] });
      }
    },
    get: () => {
      if (sql.includes('SELECT COUNT')) {
        return { cnt: (tables.get('_migrations') ?? []).length };
      }
      return undefined;
    },
  };
});

const mockExec = vi.fn((sql: string) => {
  execHistory.push(sql);
});

const mockTransaction = vi.fn((fn: Function) => {
  return (...args: any[]) => fn(...args);
});

const mockDb = {
  exec: mockExec,
  prepare: mockPrepare,
  transaction: mockTransaction,
  pragma: vi.fn(),
};

vi.mock('../../db/connection.js', () => ({
  db: mockDb,
  getDb: () => mockDb,
  default: mockDb,
}));

// Import after mock is set up
const { runMigrations } = await import('../../db/migrate.js');

describe('migration', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('runMigrations creates all expected tables', () => {
    runMigrations();

    // exec should have been called at least twice:
    // 1) CREATE _migrations table
    // 2) the 001_init.sql content
    expect(mockExec).toHaveBeenCalled();

    // Gather all SQL that was exec'd
    const allSql = execHistory.join('\n');

    expect(allSql).toContain('_migrations');
    expect(allSql).toContain('users');
    expect(allSql).toContain('products');
    expect(allSql).toContain('projects');
    expect(allSql).toContain('specifications');
    expect(allSql).toContain('test_scripts');
    expect(allSql).toContain('settings');
    expect(allSql).toContain('api_key_usage');
    expect(allSql).toContain('audit_logs');
  });

  it('running migrations twice does not throw and skips already-applied', () => {
    runMigrations();
    const execCountAfterFirst = mockExec.mock.calls.length;

    // Second run should not throw
    expect(() => runMigrations()).not.toThrow();

    // Second run should only exec the _migrations CREATE (no new migration SQL)
    // because the migration is already recorded
    const execCountAfterSecond = mockExec.mock.calls.length;
    // Only 1 additional exec call for the CREATE TABLE IF NOT EXISTS _migrations
    expect(execCountAfterSecond - execCountAfterFirst).toBe(1);
  });
});
