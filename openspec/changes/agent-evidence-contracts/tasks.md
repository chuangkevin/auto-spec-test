## 1. OpenSpec

- [x] 1.1 新增 `agent-evidence-contracts` proposal / design / spec，定義 discussion contract 與 evidence hierarchy

## 2. Discussion Agent Contract

- [x] 2.1 擴充 `DiscussionMessage` 結構，加入 `focusAreas` / `risks` / `evidenceBasis`
- [x] 2.2 修改 Echo / Lisa / Bob prompt，要求回傳結構化 JSON；失敗時提供合理 fallback
- [x] 2.3 更新 `formatDiscussionForPrompt()`，輸出 coverage checklist 而非僅原始對話

## 3. Evidence Hierarchy

- [x] 3.1 新增共用 helper 組 Evidence Hierarchy Block
- [x] 3.2 在 `pageScannerService.scanPage()` prompt 中注入 evidence hierarchy 與標準化來源段落
- [x] 3.3 在 judge prompt 中注入 judge 專用 evidence hierarchy
- [x] 3.4 在 `dream()` prompt 中注入 learning 專用 evidence hierarchy

## 4. Judge / Dream Contract

- [x] 4.1 讓 judge prompt 明確標示依據步驟記錄與最終頁面觀察判定
- [x] 4.2 讓 `dream()` 回傳結構化 learnings，含 `evidenceBasis` 與安全 fallback

## 5. Result Provenance

- [x] 5.1 在 `test_case_results` 保存 `evidence_provenance`
- [x] 5.2 latest test run API 回傳 `evidenceProvenance`
- [x] 5.3 Markdown report 顯示判定依據
- [x] 5.4 latest run UI 顯示 `evidenceProvenance`

## 6. Agent Status Surface

- [x] 6.1 保存 `agent_timeline` 到 test run
- [x] 6.2 WebSocket 提供 agent timeline 給執行中面板
- [x] 6.3 latest run API 回傳 agent timeline
- [x] 6.4 UI 顯示 fallback / disagreement / evidence sources

## 7. Verification

- [x] 7.1 跑 backend build 或型別檢查，確認新增欄位與 helper 不破壞既有流程
- [x] 7.2 跑 server test，確認既有單元測試未被破壞
- [x] 7.3 跑 web build，確認 agent status UI 可編譯
