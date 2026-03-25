# 開發階段

| 階段 | 範圍 | 交付物 |
|------|------|--------|
| **Phase 1 (MVP)** | 專案管理 + 規格書上傳 + AI 產出腳本 + 腳本編輯與下載 | 可用的腳本產出工具 |
| **Phase 2** | 測試執行（Playwright + Gemini Agent + 內嵌瀏覽器 + 任務清單互動 + 手動介入）+ 測試報告 | 完整的可視化自動測試功能 |
| **Phase 3** | URL 快速測試（元件掃描 + 智慧探索）+ 資料歸檔 + 測試記錄 | 無需規格書也能測試 + 完整資料管理 |
| **Phase 4** | API Key Pool + Slack 整合 + 使用者管理 + 系統設定 | 完整的系統管理功能 |

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
