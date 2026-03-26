<!-- status: done -->
<!-- 所有 Phase 1-4 及 Gitea 整合皆已完成。額外完成：智慧探索式測試、互動式瀏覽器、AI 團隊討論、一鍵建立專案、URL 重複偵測。 -->

# 開發階段

| 階段 | 範圍 | 交付物 | 狀態 |
|------|------|--------|------|
| **Phase 1 (MVP)** | 專案管理 + 規格書上傳 + AI 產出腳本 + 腳本編輯與下載 | 可用的腳本產出工具 | **已完成** |
| **Phase 2** | 測試執行（Playwright + Gemini Agent + 內嵌瀏覽器 + 任務清單互動 + 手動介入）+ 測試報告 | 完整的可視化自動測試功能 | **已完成** |
| **Phase 3** | URL 快速測試（元件掃描 + 智慧探索）+ 資料歸檔 + 測試記錄 | 無需規格書也能測試 + 完整資料管理 | **已完成** |
| **Phase 4** | API Key Pool + Slack 整合 + 使用者管理 + 系統設定 | 完整的系統管理功能 | **已完成** |
| **Gitea 整合** | PAT 連接 + Org/Repo 列表 + 專案綁定 + Issue 建立 | Gitea Bug 追蹤整合 | **已完成** |

## 開發流程規範

### 功能粒度

- 功能細切為可獨立測試的最小單元
- 每個功能完成後立即測試

### 每完成一個小功能

1. 實作功能程式碼
2. 撰寫並執行單元測試，確保通過
3. 更新 spec（若有規格變更）
4. commit + push

### 每完成一個大功能模組

1. 完成所有小功能
2. 撰寫並執行 E2E 測試
3. 更新 spec
4. commit + push

## Phase 1 實作進度

| 功能 | 狀態 | 測試 |
|------|------|------|
| Monorepo 初始化 | 完成 | - |
| DB connection + migration | 完成 | 通過 (2/2) |
| Auth (service + middleware + routes) | 完成 | 通過 (5/5) |
| Products CRUD API | 完成 | 通過 (TypeScript) |
| Projects CRUD API (含篩選搜尋) | 完成 | 通過 (TypeScript) |
| FileParser service | 完成 | 通過 (5/5) |
| GeminiKeyPool service | 完成 | 通過 (TypeScript) |
| AIService + Prompts | 完成 | 通過 (TypeScript) |
| Specifications routes (上傳+解析) | 完成 | 通過 (TypeScript) |
| TestScripts routes (產出+CRUD+下載) | 完成 | 通過 (TypeScript) |
| Settings routes (API Key 管理) | 完成 | 通過 (TypeScript) |
| 前端初始化 + Auth + Layout | 完成 | 通過 (Build) |
| 前端專案列表 + 建立專案 + 產品管理 | 完成 | 通過 (Build) |
| 前端專案詳情頁 + 規格上傳 + 大綱預覽 | 完成 | 通過 (Build) |
| 前端腳本編輯器 (雙模式) + 系統設定 | 完成 | 通過 (Build) |
| Phase 1 E2E 測試 | 完成 | 通過 (35/35) |

## Phase 2 實作進度

| 功能 | 狀態 | 說明 |
|------|------|------|
| Playwright 內嵌瀏覽器 + headless 截圖串流 | 完成 | BrowserDriver + WebSocket 串流 |
| WebSocket 即時通訊（截圖 + 步驟 + 結果） | 完成 | /ws/test-session |
| AI 頁面掃描（Gemini Vision） | 完成 | 元件偵測 + 測試計畫產出 |
| 測試執行面板 | 完成 | URL 輸入、截圖顯示、任務清單 |
| 快速測試頁面（/quick-test） | 完成 | 貼 URL 直接測試，不需建專案 |
| 測試任務清單互動 | 完成 | checkbox 選擇、排序、新增、展開詳情 |
| 控制面板 | 完成 | 暫停/繼續/跳過/終止/手動介入 |
| 測試報告 Tab | 完成 | 摘要統計、逐案例結果、下載 MD |
| DB: test_runs + test_case_results 表 | 完成 | - |
| AI 測試執行 Agent（逐步操作瀏覽器） | 完成 | AI Explorer + Self-Question + Multi-Judge |

## Gitea 整合實作進度

| 功能 | 狀態 | 說明 |
|------|------|------|
| Personal Access Token 連接（全域） | 完成 | 改用 PAT 取代原規劃的 OAuth2 |
| Organization 列表 + Repo 列表 | 完成 | - |
| 專案綁定 Gitea Repo | 完成 | - |
| 在 org 底下建立測試 Issues 專用 Repo | 完成 | 從 UI 建立 Repo |
| Issue 建立（單個 + 批次）+ bug label | 完成 | GiteaPushButton / GiteaBatchPush 元件 |

## 額外完成功能

| 功能 | 說明 |
|------|------|
| 智慧探索式測試 | AI Explorer + Self-Question + Multi-Judge 架構 |
| 互動式瀏覽器 | 遠端點擊/輸入操作 |
| AI 團隊討論 | Echo/Lisa/Bob 多角色協作 |
| 一鍵建立專案 | 快速專案建立流程 |
| URL 重複偵測 | 避免重複測試相同 URL |
