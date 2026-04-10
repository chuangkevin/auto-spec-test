## 1. OpenSpec

- [x] 1.1 新增 `agent-evidence-contracts` proposal / design / spec，定義 discussion contract 與 evidence hierarchy

## 2. Discussion Agent Contract

- [x] 2.1 擴充 `DiscussionMessage` 結構，加入 `focusAreas` / `risks` / `evidenceBasis`
- [x] 2.2 修改 Echo / Lisa / Bob prompt，要求回傳結構化 JSON；失敗時提供合理 fallback
- [x] 2.3 更新 `formatDiscussionForPrompt()`，輸出 coverage checklist 而非僅原始對話

## 3. Evidence Hierarchy

- [x] 3.1 新增共用 helper 組 Evidence Hierarchy Block
- [x] 3.2 在 `pageScannerService.scanPage()` prompt 中注入 evidence hierarchy 與標準化來源段落

## 4. Verification

- [x] 4.1 跑 backend build 或型別檢查，確認新增欄位與 helper 不破壞既有流程
- [x] 4.2 跑 server test，確認既有單元測試未被破壞
- [x] 4.3 針對新增 helper / formatter 補單元測試
