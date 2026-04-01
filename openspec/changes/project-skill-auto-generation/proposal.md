## Why

AI Agent 在測試時無法有效利用規格書的業務知識。12000+ 字的規格書被截斷或全灌進 prompt，AI 要嘛忽略關鍵規則（如 URL 格式），要嘛 token 爆掉。Global skill 跟特定專案無關（20 個 HousePrice 後端 skill 灌進租屋前端測試）。

參考 Claude Code 洩漏的三層記憶架構（L1 輕量索引永遠載入 → L2 按需載入 → L3 原文不重讀），我們需要一個 **L1 層**：從規格書自動提取精煉的 project skill，測試時直接注入，不需要篩選也不需要讀原文。

## What Changes

- **DB `agent_skills` 加 `project_id`**：nullable，null = global，有值 = project-specific
- **規格書解析後自動生成 project skill**：用 AI 從 `parsed_outline_md` 提取 3-5 個精煉的業務規則 skill（如 URL 格式、篩選邏輯、清空規則）
- **測試時優先載入 project skill**：有 project skill 就用，不夠再從 global 篩選
- **前端專案頁面顯示 project skill**：可查看、編輯、重新生成
- **Skill 格式遵循 skill-creator 的 Progressive Disclosure**：name+description（~100 字索引）+ content（200-500 字精煉規則）

## Capabilities

### New Capabilities
- `project-skill-generation`: 從規格書自動提取 project-scoped skill，三層記憶架構的 L1 層

### Modified Capabilities
- `skill-management`: agent_skills 表加 project_id 欄位，支援 project scope

## Impact

- **DB**: migration 006 加 `project_id` 欄位
- **Server**: skillService 新增 `generateFromSpec()`、`getProjectSkills()`；testRunner scan 流程優先用 project skill
- **Web**: 專案頁面顯示 project skill 區塊

## 範圍外

- 不做 autoDream（測試完成後自動更新 skill）— 之後再做
- 不做 skill 版本控制
- 不做 skill 品質評估（skill-creator 的 eval loop）— 之後再做
