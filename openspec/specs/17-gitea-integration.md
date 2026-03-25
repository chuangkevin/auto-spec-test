# 功能模組：Gitea 整合

## 設計概念

將測試報告中發現的 Bug 自動或手動推送到 Gitea，建立 Issue 並掛到 Project Board 追蹤。使用 OAuth2 瀏覽器授權，使用者不需手動貼 token。

## OAuth2 授權流程

1. 管理員在系統設定中配置 Gitea URL
2. 管理員在 Gitea 建立 OAuth2 Application（取得 Client ID / Secret）
3. 使用者點擊「連接 Gitea」→ 跳轉 Gitea 授權頁
4. 使用者同意授權 → 跳回系統帶 authorization code
5. 後端用 code 換取 access_token，儲存到 DB（綁定使用者）
6. 後續 API 呼叫使用該 token

## 系統設定

| 設定項 | 說明 |
|--------|------|
| Gitea URL | Gitea 伺服器網址（使用者自行輸入） |
| OAuth2 Client ID | 從 Gitea 取得 |
| OAuth2 Client Secret | 從 Gitea 取得（加密儲存） |

## 專案綁定

- 每個測試專案可選擇綁定一個 Gitea Repository
- 建立專案時或之後設定
- 從 Gitea API 拉取使用者有權限的 repo 列表供選擇

## Bug → Issue 推送

### 自動模式

測試報告產出後，自動將所有 Bug 建立為 Gitea Issue。

### 手動模式

在測試報告中，每個 Bug 旁有「推送到 Gitea」按鈕，使用者選擇要推送的 Bug。

### Issue 內容格式

```markdown
## Bug 描述
{AI 產出的 Bug 描述}

## 重現步驟
1. {步驟}
2. ...

## 預期結果
{預期結果}

## 實際結果
{實際結果}

## 截圖
{截圖連結}

## AI 建議修復方向
{AI 分析的建議}

---
> 由 Auto Spec Test 自動產出
> 測試專案：{專案名稱}
> 測試日期：{日期}
> 對應測試案例：{TC-ID}
```

### Issue 設定

| 項目 | 行為 |
|------|------|
| Label | 自動加上 `bug` |
| Assignee | 使用者可選擇指派人員（從 Gitea 拉成員清單） |
| Project | 自動掛到該次測試的 Project Board |

## Gitea Project Board

- 每次測試執行建立一個 Gitea Project（看板）
- Project 名稱：`{專案名稱} - {測試日期}`
- 所有該次測試的 Bug Issues 自動掛上此 Project
- 方便在 Gitea 以看板方式追蹤 Bug 修復進度

## 資料模型擴充

```sql
-- Gitea 連接設定（每個使用者）
CREATE TABLE gitea_connections (
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

-- 專案與 Gitea Repo 的綁定
ALTER TABLE projects ADD COLUMN gitea_repo TEXT;
-- 格式：owner/repo

-- Issue 推送記錄
CREATE TABLE gitea_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bug_id INTEGER REFERENCES bugs(id),
  execution_id INTEGER REFERENCES test_executions(id),
  gitea_issue_number INTEGER NOT NULL,
  gitea_issue_url TEXT NOT NULL,
  gitea_repo TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | /api/gitea/auth-url | 取得 OAuth2 授權 URL |
| GET | /api/gitea/callback | OAuth2 callback，換取 token |
| GET | /api/gitea/status | 檢查目前使用者的 Gitea 連接狀態 |
| GET | /api/gitea/repos | 取得使用者有權限的 repo 列表 |
| GET | /api/gitea/repos/:owner/:repo/members | 取得 repo 成員清單 |
| POST | /api/gitea/issues | 建立單個 Issue |
| POST | /api/gitea/issues/batch | 批次建立 Issues（一次測試的所有 Bug） |
| POST | /api/gitea/projects | 建立 Gitea Project Board |
