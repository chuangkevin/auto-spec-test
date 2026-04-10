## Context

現有流程中，討論 Agent（Echo/Lisa/Bob）回傳的是單純 `message`。scan 階段雖然會把 discussion 注入 prompt，但缺少可機器消費的結構化欄位，導致：

1. 討論重點只能靠下游 agent 再次閱讀整段自然語言自行提取
2. 不同 prompt 對「什麼證據優先」的理解不完全一致
3. 當 test plan 品質不好時，難以回溯是 spec、skill、discussion 還是 live evidence 造成

## Goals / Non-Goals

**Goals**
- 為討論 Agent 建立輕量但明確的輸出 contract
- 在 scanPage 階段建立統一的 evidence hierarchy prompt block
- 讓 judge / dream 也使用一致的 evidence ordering 與結構化輸出
- 保持現有前端顯示與 API 基本相容

**Non-Goals**
- 不導入完整 capability registry 或權限型 subagent runtime
- 不重做 dream / judge 的整體架構
- 不做大型資料模型重構；只接受保存 provenance 所需的最小 schema 擴充

## Decisions

### D1: Discussion output 採用擴充型結構，不取代現有 message

每個 discussion message 保留原本的 `message`，另外新增：
- `focusAreas`: 應被 test plan 覆蓋的功能或流程
- `risks`: 失敗風險或易誤判區域
- `evidenceBasis`: 該 agent 主要依據的證據類型或來源

理由：前端與既有流程仍可繼續使用 `message` 顯示，不需要大改 UI；後端則能開始消費結構化欄位。

### D2: scanPage 之前先組 Evidence Hierarchy Block

新增一層標準化 evidence block，明確定義優先順序：

1. Live page evidence（screenshot / DOM / executed behaviors）
2. Raw spec text
3. Parsed spec outline
4. Skills（verified 與 unverified 仍由 skill 文案自行標記）
5. Discussion suggestions

這個 hierarchy block 只負責說明規則與來源，不承擔 token-heavy 的摘要責任。

### D3: Discussion summary 以 coverage checklist 為主

`formatDiscussionForPrompt()` 除了保留原始對話外，還輸出：
- 聚合後的 focus areas
- 聚合後的 risks
- 各 agent 的 evidence basis

這讓 scanPage prompt 可以直接要求「每個 focus area 至少對應一個 TC」，而不是只靠自然語言暗示。

### D4: Judge 與 Dream 使用角色化 evidence block

不同 agent 雖然共享 evidence-first 原則，但依據來源不同：

- `Judge`: 以步驟執行記錄與最終頁面觀察為主，不重新注入 skills
- `Dream`: 以失敗案例摘要與現有 project skills 為主，僅把 skills 視為可更新目標，不視為真理

因此使用同一套 evidence hierarchy 精神，但由 helper 依角色輸出不同說明文字，避免 prompt 漂移。

### D5: Provenance 落在 test_case_results 與報告層

執行後如果沒有保存判定依據，evidence-first 只會停留在 prompt 規則，無法被後續 API、報告與 dream 重用。因此 `test_case_results` 額外保存 `evidence_provenance`，供：

- latest test run API 顯示結果依據
- Markdown report 顯示「判定依據」
- dream 在學習失敗案例時讀到上一輪判定主要依據

## Risks / Trade-offs

- Prompt 內容會略增，但可換來更穩定的下游推理
- AI 可能回傳不完整的 structured fields，因此需要 fallback normalization
- 這仍屬 workflow-first 設計，不會解決完整 subagent permission 問題，但符合目前產品階段
