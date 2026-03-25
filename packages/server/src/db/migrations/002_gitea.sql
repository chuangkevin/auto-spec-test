-- 002_gitea.sql  –  Gitea integration tables

CREATE TABLE IF NOT EXISTS gitea_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  gitea_url TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TEXT,
  gitea_username TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

-- Add gitea_repo column to projects table
ALTER TABLE projects ADD COLUMN gitea_repo TEXT;
