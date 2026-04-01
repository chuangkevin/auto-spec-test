## ADDED Requirements

### Requirement: 規格書解析後自動生成 Project Skill
系統 SHALL 在規格書解析完成後，自動從 parsed_outline_md 提取 3-5 個精煉的業務規則，存為 project-scoped skill。

#### Scenario: 規格書解析觸發 skill 生成
- **WHEN** 規格書解析成功（parsed_outline_md 長度 >= 500 字）
- **THEN** 系統 SHALL 非同步呼叫 AI 提取業務規則，生成 3-5 個 project skill

#### Scenario: 規格書太短不觸發
- **WHEN** parsed_outline_md 長度 < 500 字
- **THEN** SHALL NOT 觸發自動生成

#### Scenario: 重複解析不重複生成
- **WHEN** 同一 project 已有 project skill，再次解析規格書
- **THEN** SHALL 刪除舊的 project skill，重新生成（upsert by project_id + name）

### Requirement: Skill 內容品質
每個自動生成的 skill SHALL 遵循 Progressive Disclosure 原則：name + description（索引，~100 字）+ content（精煉規則，200-500 字）。

#### Scenario: URL 格式規則提取
- **WHEN** 規格書包含 URL 參數規則
- **THEN** 生成的 skill SHALL 包含具體的 URL 格式範例和參數說明

#### Scenario: 篩選邏輯提取
- **WHEN** 規格書包含篩選條件的交互邏輯（如「切換現況保留區域」）
- **THEN** 生成的 skill SHALL 包含具體的篩選行為描述

### Requirement: 測試時優先載入 Project Skill
測試流程 SHALL 優先載入 project skill，不夠再 fallback 到 global skill。

#### Scenario: 有 project skill
- **WHEN** 測試的 project 有自動生成的 skill
- **THEN** discuss 和 scanPage SHALL 直接注入 project skill，不呼叫 selectRelevant

#### Scenario: 無 project skill
- **WHEN** 測試的 project 沒有 project skill
- **THEN** SHALL fallback 到現有的 selectRelevant global skill 篩選流程

### Requirement: 前端顯示 Project Skill
專案頁面 SHALL 顯示自動生成的 project skill，支援查看、編輯、重新生成。

#### Scenario: 顯示 skill 列表
- **WHEN** 使用者在專案頁面查看已生成的 skill
- **THEN** SHALL 顯示每個 skill 的 name、description，可展開查看 content

#### Scenario: 重新生成
- **WHEN** 使用者點擊「重新生成」按鈕
- **THEN** SHALL 刪除舊的 project skill 並重新從規格書提取
