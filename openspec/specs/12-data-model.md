# 資料模型（SQLite）

```sql
-- 使用者
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 產品（使用者可自行建立）
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code TEXT,
  description TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 測試專案
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'has_script' | 'testing' | 'completed'
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 規格書
CREATE TABLE specifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  original_files TEXT NOT NULL,          -- JSON array: [{name, path, size, type}]
  parsed_outline_md TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 測試腳本
CREATE TABLE test_scripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  specification_id INTEGER REFERENCES specifications(id),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content_md TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 測試執行
CREATE TABLE test_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id),
  test_script_id INTEGER REFERENCES test_scripts(id),
  target_url TEXT NOT NULL,
  test_account TEXT,
  test_password TEXT,
  execution_mode TEXT NOT NULL DEFAULT 'auto',  -- 'auto' | 'step_by_step'
  browser_width INTEGER DEFAULT 1280,
  browser_height INTEGER DEFAULT 720,
  status TEXT NOT NULL DEFAULT 'queued',  -- 'queued' | 'running' | 'paused' | 'manual' | 'completed' | 'cancelled' | 'failed'
  progress INTEGER DEFAULT 0,
  current_case_id TEXT,
  selected_cases TEXT,                    -- JSON array: 使用者勾選的案例 ID
  case_order TEXT,                        -- JSON array: 使用者排定的執行順序
  started_at TEXT,
  completed_at TEXT,
  executed_by INTEGER REFERENCES users(id),
  source TEXT NOT NULL DEFAULT 'project',  -- 'project' | 'url_quick_test'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 測試結果（每個測試案例）
CREATE TABLE test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
  test_case_id TEXT NOT NULL,
  test_case_name TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'pass' | 'fail' | 'skip' | 'known_issue'
  actual_result TEXT,
  screenshot_path TEXT,
  error_detail TEXT,
  execution_time_ms INTEGER,
  sort_order INTEGER,                     -- 實際執行順序
  is_manual_added INTEGER DEFAULT 0,      -- 是否為使用者手動新增的案例
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 測試步驟 Log（逐步驟記錄）
CREATE TABLE test_step_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
  test_case_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  description TEXT NOT NULL,
  ai_action TEXT,
  ai_reasoning TEXT,
  screenshot_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'success' | 'fail'
  is_manual INTEGER DEFAULT 0,            -- 是否為手動介入時的操作
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 頁面掃描結果（URL 快速測試用）
CREATE TABLE page_scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER REFERENCES test_executions(id) ON DELETE CASCADE,
  target_url TEXT NOT NULL,
  screenshot_path TEXT,
  dom_snapshot TEXT,                       -- 精簡版 DOM 結構
  components_json TEXT,                    -- AI 辨識的元件清單 JSON
  generated_cases_json TEXT,               -- AI 產出的測試案例清單 JSON
  spec_files TEXT,                         -- 附加的規格書 JSON array（若有）
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 測試報告
CREATE TABLE test_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
  report_md TEXT NOT NULL,
  total_cases INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  pass_rate REAL NOT NULL DEFAULT 0,
  bug_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Bug 清單
CREATE TABLE bugs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES test_reports(id) ON DELETE CASCADE,
  bug_code TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,  -- 'high' | 'medium' | 'low'
  test_case_id TEXT,
  reproduce_steps TEXT,
  expected_result TEXT,
  actual_result TEXT,
  screenshot_path TEXT,
  suggestion TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 系統設定
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- API Key 用量追蹤
CREATE TABLE api_key_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_suffix TEXT NOT NULL,
  model TEXT NOT NULL,
  call_type TEXT NOT NULL,  -- 'spec_parse' | 'script_generate' | 'page_scan' | 'test_execute' | 'report_generate'
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  project_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 操作紀錄
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```
