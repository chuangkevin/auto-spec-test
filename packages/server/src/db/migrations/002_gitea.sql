-- 002_gitea.sql  –  Gitea integration tables (Personal Access Token 模式)

CREATE TABLE IF NOT EXISTS gitea_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  gitea_url TEXT NOT NULL,
  access_token TEXT NOT NULL,
  gitea_username TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gitea_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bug_id INTEGER,
  execution_id INTEGER,
  gitea_issue_number INTEGER NOT NULL,
  gitea_issue_url TEXT NOT NULL,
  gitea_repo TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Add gitea columns to projects table
ALTER TABLE projects ADD COLUMN gitea_org TEXT;
ALTER TABLE projects ADD COLUMN gitea_repo TEXT;
ALTER TABLE projects ADD COLUMN gitea_project_id INTEGER;
