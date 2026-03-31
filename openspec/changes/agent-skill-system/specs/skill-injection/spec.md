## ADDED Requirements

### Requirement: Skill 注入 AI 討論

AI 討論 Agent（Echo/Lisa/Bob）SHALL 在 prompt 中接收啟用中的 skill 內容作為領域知識。

#### Scenario: 討論包含 Skill 上下文

- **WHEN** 發起 AI 團隊討論（discuss）且有啟用的 skill
- **THEN** 每個 Agent 的 prompt SHALL 包含 skill 內容，格式為 `=== 領域知識 ===\n### skill-name\ncontent\n===`

#### Scenario: Skill 數量限制

- **WHEN** 啟用的 skill 超過 5 個
- **THEN** SHALL 只注入前 5 個（按 order_index 排序），避免 token 超量

#### Scenario: Skill 內容截斷

- **WHEN** 單個 skill 的 content 超過 2000 字元
- **THEN** SHALL 截斷至 2000 字元並附加「...（已截斷）」

### Requirement: Skill 注入測試生成

scanPage prompt SHALL 包含啟用中的 skill 內容，影響測試案例生成方向。

#### Scenario: 掃描時注入 Skill

- **WHEN** 執行頁面掃描生成測試計畫
- **THEN** enrichedSpec SHALL 包含啟用的 skill 內容，AI 根據領域知識產出更精準的測試案例

#### Scenario: Skill 影響測試案例

- **WHEN** skill 包含「會員登入需要手機驗證」等業務規則
- **THEN** 產出的測試案例 SHALL 考慮該規則，如「驗證手機驗證碼輸入」流程

### Requirement: 無 Skill 時不影響既有功能

#### Scenario: 無啟用 Skill

- **WHEN** 系統沒有任何啟用的 skill
- **THEN** AI 流程 SHALL 正常運作，與現有行為完全相同
