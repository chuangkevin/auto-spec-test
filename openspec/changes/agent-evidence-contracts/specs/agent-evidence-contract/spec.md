## ADDED Requirements

### Requirement: 討論 Agent 回傳結構化測試重點
系統 SHALL 要求每個討論 Agent 在自由文字發言之外，同時回傳可供後續 agent 消費的結構化欄位。

#### Scenario: Echo 回傳測試重點
- **WHEN** Echo 分析頁面並提出測試方向
- **THEN** SHALL 回傳 `message`、`focusAreas`、`risks`、`evidenceBasis` 欄位

#### Scenario: 結構化欄位缺失時的降級
- **WHEN** 某個討論 Agent 沒有回傳完整 JSON 或欄位缺失
- **THEN** 系統 SHALL 使用 fallback 值補齊，仍保留 discussion 結果供 scan 階段使用

### Requirement: 測試生成遵守統一證據層級
scan/test generation 階段 SHALL 明確遵守 evidence hierarchy，而非把所有上下文視為同等可信。

#### Scenario: raw spec 與 discussion 衝突
- **WHEN** 討論建議與 raw spec 文字衝突
- **THEN** 系統 SHALL 以 raw spec 為準，不得因 discussion 建議覆蓋正式規格

#### Scenario: live page evidence 與 skill 衝突
- **WHEN** DOM / screenshot / explored behavior 顯示的頁面狀態與 skill 描述不一致
- **THEN** 測試生成 SHALL 以 live page evidence 為優先，避免僅依 skill 腦補流程

### Requirement: Discussion summary 以 coverage checklist 注入 scan prompt
系統 SHALL 將 discussion 的結構化 focus areas 與 risks 格式化為 coverage checklist，注入 scan prompt，讓後續測試案例能回應討論結果。

#### Scenario: focus area 被強制覆蓋
- **WHEN** discussion 聚合出某個 focus area（如「權限控制」）
- **THEN** scan prompt SHALL 要求至少一個測試案例對應該 focus area；若找不到對應 DOM 功能，則以缺失案例標記

### Requirement: Judge 遵守 evidence-first 評判順序
judge 階段 SHALL 使用一致的 evidence ordering，優先依據步驟執行記錄與最終頁面觀察，而非重複相信上游的 skill 或 discussion。

#### Scenario: judge 遇到上游建議與執行證據衝突
- **WHEN** 測試生成階段的假設與實際步驟執行記錄或截圖衝突
- **THEN** judge SHALL 以步驟執行記錄與最終頁面觀察為準，不得因上游建議而強行判定

### Requirement: Dream 以失敗證據與現有 skills 做結構化學習
dream 階段 SHALL 將失敗案例與可更新的 project skills 視為不同層級的證據，並回傳結構化 learning 結果。

#### Scenario: real bug 不應污染 skill
- **WHEN** dream 判定失敗案例屬於 `real_bug`
- **THEN** SHALL 保留 learning 記錄，但不得更新任何 skill

#### Scenario: learning 缺少完整欄位時降級
- **WHEN** dream 沒有回傳完整 learning 欄位
- **THEN** 系統 SHALL 忽略不完整項目或使用安全 fallback，而不是寫入模糊 skill 更新

### Requirement: Test result 與 report 保留 evidence provenance
測試執行完成後，系統 SHALL 保存每個案例的主要判定依據，並在 API 與報告中可讀取。

#### Scenario: latest run API 回傳判定依據
- **WHEN** 使用者讀取最新測試結果
- **THEN** 每個案例結果 SHALL 包含 `evidenceProvenance` 欄位，顯示判定主要依據

#### Scenario: Markdown report 顯示判定依據
- **WHEN** 系統生成測試報告
- **THEN** failed case 與詳細結果 SHOULD 顯示「判定依據」，避免只有結論沒有來源
