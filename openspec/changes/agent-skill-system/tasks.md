## 1. DB Schema + Service

- [x] 1.1 建立 migration `005_agent_skills.sql`：`agent_skills` 表（id, name UNIQUE, description, content, enabled, order_index, created_at, updated_at）。驗收：server 啟動後表存在。
- [x] 1.2 建立 `packages/server/src/services/skillService.ts`：getAll()、getById()、create()、update()、remove()、toggle()、getActive()（回傳 enabled=1 且按 order_index 排序的 skill）。驗收：各方法可正常操作 DB。

## 2. REST API

- [x] 2.1 建立 `packages/server/src/routes/skills.ts`：GET /api/skills、POST /api/skills、PUT /api/skills/:id、DELETE /api/skills/:id、PATCH /api/skills/:id/toggle。驗收：所有 CRUD 端點回傳正確。
- [x] 2.2 實作 POST /api/skills/batch：接收 `{ skills: [{ name, description, content }] }`，upsert by name，回傳 `{ imported, updated }`。驗收：重複匯入不產生重複資料。
- [x] 2.3 在 index.ts 註冊 skill routes。驗收：API 可透過 curl 測試。

## 3. Skill 注入 AI 流程

- [x] 3.1 修改 `testOrchestrator.discuss()`：取得 getActive() 的 skill，注入到 Echo/Lisa/Bob 的 prompt（格式：`=== 領域知識 ===`，最多 5 個，每個 content 截斷 2000 字）。驗收：討論 prompt 包含 skill 內容。
- [x] 3.2 修改 `testRunner.ts` scan 流程：取得 getActive() 的 skill，附加到 enrichedSpec。驗收：scanPage prompt 包含 skill 內容。

## 4. 前端 — 系統設定 Skill 管理

- [x] 4.1 在系統設定頁面新增「AI Skills」tab：skill 列表、啟用/停用 toggle、刪除按鈕。驗收：可看到所有 skill 並切換啟用狀態。
- [x] 4.2 實作批次匯入 UI：拖拉 .md 檔案區域 → 解析 YAML frontmatter + content → 預覽列表（名稱、描述、新增/更新標記）→ 確認按鈕呼叫 batch API。驗收：拖入 SKILL.md 後可預覽並匯入。
- [x] 4.3 實作 skill 編輯 UI：點擊展開可編輯 name、description、content（textarea）→ 儲存呼叫 PUT API。驗收：可編輯並儲存 skill。

## 5. 整合測試

- [ ] 5.1 匯入一個測試 skill（如「租屋物件必須有坪數和租金」），跑完整流程確認 AI 討論和測試案例有考慮到 skill 的規則。驗收：報告中有反映 skill 知識的測試案例。（需手動測試）
