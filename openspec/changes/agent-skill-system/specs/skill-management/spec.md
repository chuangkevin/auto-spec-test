## ADDED Requirements

### Requirement: Skill 資料模型

系統 SHALL 提供 `agent_skills` 資料表儲存領域知識，包含 name（唯一）、description、content（Markdown）、enabled、order_index。

#### Scenario: 建立 Skill

- **WHEN** 使用者透過 API 或 UI 建立一個 skill（name="member-rules", description="會員規則", content="# 會員..."）
- **THEN** 系統 SHALL 儲存 skill 並產生唯一 id，enabled 預設為 1

#### Scenario: Skill name 唯一

- **WHEN** 嘗試建立 name 已存在的 skill
- **THEN** SHALL 回傳 409 Conflict 錯誤

### Requirement: Skill CRUD API

系統 SHALL 提供完整的 Skill CRUD REST API。

#### Scenario: 列出所有 Skill

- **WHEN** GET /api/skills
- **THEN** SHALL 回傳所有 skill，按 order_index ASC 排序

#### Scenario: 更新 Skill

- **WHEN** PUT /api/skills/:id { name, description, content }
- **THEN** SHALL 更新對應欄位並更新 updated_at

#### Scenario: 刪除 Skill

- **WHEN** DELETE /api/skills/:id
- **THEN** SHALL 刪除該 skill

#### Scenario: 啟用/停用 Skill

- **WHEN** PATCH /api/skills/:id/toggle
- **THEN** SHALL 切換 enabled 狀態（1→0 或 0→1）

### Requirement: 批次匯入 SKILL.md

系統 SHALL 支援從 SKILL.md 檔案批次匯入 skill，格式與 project-bridge 相容。

#### Scenario: SKILL.md 格式

- **WHEN** 使用者上傳包含 YAML frontmatter（name, description）和 Markdown content 的 .md 檔案
- **THEN** 系統 SHALL 正確解析 frontmatter 和 content

#### Scenario: 批次 Upsert

- **WHEN** POST /api/skills/batch { skills: [...] }
- **THEN** name 已存在的 skill SHALL 更新 description + content；不存在的 SHALL 新增
- **THEN** SHALL 回傳 { imported: N, updated: M }

#### Scenario: 批次匯入冪等

- **WHEN** 重複匯入相同的 SKILL.md 檔案
- **THEN** SHALL 不產生重複資料，僅更新已存在的 skill

### Requirement: 系統設定 UI — Skill 管理

系統設定頁面 SHALL 提供 Skill 管理介面。

#### Scenario: Skill 列表顯示

- **WHEN** 使用者進入系統設定的 AI Skills tab
- **THEN** SHALL 顯示所有 skill 的名稱、描述、啟用狀態 toggle

#### Scenario: 批次匯入 UI

- **WHEN** 使用者拖拉 .md 檔案到匯入區域
- **THEN** SHALL 解析檔案、顯示預覽（名稱、描述、新增/更新狀態）、確認後匯入

#### Scenario: 編輯 Skill

- **WHEN** 使用者點擊 skill 展開
- **THEN** SHALL 顯示可編輯的 name、description、content 欄位
