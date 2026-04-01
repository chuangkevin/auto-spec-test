## 1. Skeptical Memory — 法官 prompt

- [ ] 1.1 修改 `pageScannerService.singleJudge()` prompt：加入「領域知識僅供參考，以截圖實際觀察為準」指令。驗收：prompt 包含 skeptical 措辭。
- [ ] 1.2 修改 `pageScannerService.arbitrate()` prompt：同上。驗收：仲裁 prompt 也包含 skeptical 措辭。

## 2. Strict Write Discipline — Skill 驗證

- [ ] 2.1 DB migration `007_skill_verified.sql`：agent_skills 加 `verified INTEGER DEFAULT 0`。驗收：欄位存在。
- [ ] 2.2 在 `skillService.generateFromSpec()` 完成後，對每個 skill 做 grep 驗證：提取 content 中的 URL pattern 和關鍵術語，在規格書原文中搜尋，找到則 verified=1。驗收：project 8 生成的 url-format-rules skill 標記為 verified。
- [ ] 2.3 前端 ProjectSkillsPanel 顯示驗證狀態（✓ / ⚠）。驗收：可視覺區分 verified 和 unverified。
- [ ] 2.4 `formatSkillsForPrompt` 對 unverified skill 附加「（此規則未在規格書中驗證，僅供參考）」。驗收：unverified skill 注入時有標記。

## 3. autoDream — 測試後學習

- [ ] 3.1 在 `skillService` 新增 `dream(projectId, testResults)`：用 AI 分析失敗案例，分類原因，回傳更新建議。驗收：對有 FAIL 的測試結果回傳分類。
- [ ] 3.2 在 `testRunner.executeTests()` 結束後，如果 failedCount > 0 且有 projectId，非同步觸發 dream。驗收：server log 顯示 dream 執行。
- [ ] 3.3 Dream 結果自動 append 到對應 skill 的 content 尾部（selector_issue / url_format_issue）。驗收：skill content 更新。

## 4. 測試計畫版控

- [ ] 4.1 DB migration `008_test_plan_versions.sql`：建立 test_plan_versions 表。驗收：表存在。
- [ ] 4.2 在 testRunner scan 流程完成後，存入版本記錄。驗收：scan 後 DB 有版本記錄。
- [ ] 4.3 新增 API `GET /api/projects/:projectId/test-plans`：回傳版本歷史。驗收：API 回傳版本清單。
- [ ] 4.4 前端專案頁面新增「測試計畫歷史」區塊：版本清單 + 點擊查看 + 「使用此版本」按鈕。驗收：可查看歷史並回滾。

## 5. 驗證

- [ ] 5.1 Build + 重啟 server + 確認所有 server 活著。驗收：backend 401, frontend 200。
- [ ] 5.2 對 project 8 跑完整流程，確認：法官不盲信 skill、skill 有驗證狀態、dream 有觸發、測試計畫有存版本。驗收：server log 顯示完整流程。
