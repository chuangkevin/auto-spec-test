## 1. DB Schema

- [x] 1.1 建立 migration `006_skill_project_id.sql`：agent_skills 加 `project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE`，加 index。驗收：現有 global skill 不受影響（project_id = NULL）。

## 2. 後端 — Skill 生成與載入

- [x] 2.1 在 skillService 新增 `generateFromSpec(projectId, specContent)`：用 AI 從規格書提取 3-5 個 skill，upsert by (project_id, name)。驗收：對 project 8 的規格書跑一次，生成的 skill 包含 URL 格式規則。
- [x] 2.2 在 skillService 新增 `getProjectSkills(projectId)`：回傳指定 project 的 enabled skill。驗收：只回傳該 project 的 skill，不含 global。
- [x] 2.3 修改測試流程（testRunner scan + testOrchestrator discuss）：優先用 getProjectSkills，無結果才 fallback 到 selectRelevant global。驗收：有 project skill 時不呼叫 selectRelevant。
- [x] 2.4 在規格書解析 API（specifications route parse endpoint）成功後，非同步觸發 generateFromSpec。驗收：上傳規格書並解析後，DB 中出現 project skill。
- [x] 2.5 新增 API `POST /api/projects/:projectId/skills/regenerate`：刪除舊 project skill 並重新生成。驗收：重新生成後 skill 內容更新。
- [x] 2.6 修改 GET /api/skills 支援 `?project_id=N` 查詢參數。驗收：帶參數只回傳 project skill。

## 3. 前端 — 專案 Skill 顯示

- [x] 3.1 在專案頁面「測試腳本」tab 加入「AI 知識萃取」區塊：顯示 project skill 列表（name、description、展開 content）。驗收：可看到自動生成的 skill。
- [x] 3.2 加入「重新生成知識」按鈕：呼叫 regenerate API，顯示 loading 狀態，完成後刷新列表。驗收：點擊後重新生成 skill。
- [x] 3.3 每個 skill 可展開編輯（name、description、content）並儲存。驗收：手動修改 skill 後可儲存。

## 4. 驗證

- [x] 4.1 已驗證：project 8 生成 4 個 skill（url-parameter-format-and-seo、search-condition-interaction-clearing-logic、object-listing-sorting-and-display-priority、location-search-and-filter-rules），discuss Agent 引用了搜尋條件清除邏輯、URL 參數 ID 格式、noindex/canonical SEO 規則。
