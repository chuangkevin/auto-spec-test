## ADDED Requirements

### Requirement: Skill 生成後自動驗證 key facts
系統 SHALL 在從規格書生成 skill 後，自動驗證每個 skill 的 key facts 是否在規格書原文中有對應。

#### Scenario: URL 範例驗證
- **WHEN** 生成的 skill 包含 URL 格式範例（如 `/list/21_usage/`）
- **THEN** 系統 SHALL 在規格書原文中搜尋該模式，找到則標記 verified，找不到則標記 unverified

#### Scenario: 顯示驗證狀態
- **WHEN** 使用者在前端查看 project skill
- **THEN** 每個 skill SHALL 顯示驗證狀態（✓ verified / ⚠ unverified）

#### Scenario: Unverified skill 仍可使用
- **WHEN** skill 被標記為 unverified
- **THEN** 該 skill SHALL 仍然被注入 agent prompt，但附帶「此規則未在規格書中驗證」標記
