CREATE TABLE IF NOT EXISTS test_plan_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  test_plan TEXT NOT NULL,
  components TEXT,
  url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tpv_project ON test_plan_versions(project_id, version DESC);
