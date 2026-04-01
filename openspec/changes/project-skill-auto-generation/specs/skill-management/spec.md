## MODIFIED Requirements

### Requirement: Skill 資料模型
agent_skills 表 SHALL 支援 project scope，透過 nullable 的 project_id 欄位區分 global 和 project-scoped skill。

#### Scenario: Project-scoped skill
- **WHEN** skill 的 project_id 有值
- **THEN** 該 skill SHALL 只在對應 project 的測試流程中被載入

#### Scenario: Global skill 不受影響
- **WHEN** skill 的 project_id 為 NULL
- **THEN** 行為與現有完全相同（透過 selectRelevant 篩選）

#### Scenario: Project 刪除時 CASCADE
- **WHEN** project 被刪除
- **THEN** 該 project 的所有 project skill SHALL 被同步刪除

### Requirement: Skill API 支援 project scope
GET /api/skills SHALL 支援 `?project_id=N` 參數，回傳指定 project 的 skill。

#### Scenario: 查詢 project skill
- **WHEN** GET /api/skills?project_id=8
- **THEN** SHALL 只回傳 project_id=8 的 skill

#### Scenario: 查詢 global skill
- **WHEN** GET /api/skills（不帶 project_id）
- **THEN** SHALL 回傳所有 skill（包含 global 和 project）
