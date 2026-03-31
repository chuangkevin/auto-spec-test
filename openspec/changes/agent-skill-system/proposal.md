## Why

AI Agent（Echo/Lisa/Bob）目前只靠截圖和 DOM 分析來產出測試策略，完全沒有領域知識。對於有業務規則的系統（如房產平台的物件刊登規則、會員權限、交易流程），AI 無法理解這些隱性規則，導致測試案例缺乏深度。參考 project-bridge 的 skill 系統，讓使用者能匯入領域知識（SKILL.md），AI Agent 在討論和測試生成時就能考慮業務邏輯。

## What Changes

- **新增 `agent_skills` 資料表**：儲存 skill（name、description、content、scope、enabled）
- **新增系統設定 UI**：批次匯入 SKILL.md 檔案、啟用/停用/刪除 skill
- **Skill 注入 AI 流程**：討論 Agent 和 scanPage 生成時注入相關 skill 內容
- **專案級 skill 綁定**：每個專案可選擇啟用哪些 skill

## Capabilities

### New Capabilities
- `skill-management`: Skill CRUD、批次匯入 SKILL.md、啟用/停用、系統設定 UI
- `skill-injection`: Skill 內容注入 AI Agent 討論和測試生成 prompt

### Modified Capabilities
_無_

## Impact

- **DB**: 新增 `agent_skills` 表（migration 005）
- **Server**: 新增 `/api/skills` routes、skillService
- **Web**: 系統設定頁新增 Skill 管理 tab
- **AI 流程**: `testOrchestrator.discuss()` 和 `pageScannerService.scanPage()` 注入 skill 上下文

## 範圍外

- 不做 skill 衝突檢測（project-bridge 有但 auto-spec-test 不需要）
- 不做 skill 依賴圖視覺化
- 不做 skill 版本控制
