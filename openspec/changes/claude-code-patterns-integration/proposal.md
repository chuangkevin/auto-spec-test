## Why

AI Agent 目前盲信 skill 規則、skill 生成沒有品質驗證、測試完成後不會從結果中學習、測試計畫沒有版本歷史。參考 Claude Code 洩漏原始碼中的 Skeptical Memory、Strict Write Discipline、autoDream 三大設計模式，提升 agent 的可靠性和持續學習能力。

## What Changes

- **Skeptical Memory**：法官評判時把 skill 當 hint 而非真理，必須對照截圖實際驗證
- **Strict Write Discipline**：從規格書生成 skill 後，自動驗證 key facts 正確性（如 URL 格式是否在規格書原文中存在）
- **autoDream**：測試完成後，自動分析報告中的失敗原因，更新 project skill（如「此 selector 無效」「此 URL 格式確認正確」）
- **測試計畫版控**：每次 scan 產出的測試計畫存為版本，可查看歷史、比較差異、回滾

## Capabilities

### New Capabilities
- `skeptical-evaluation`: 法官評判時驗證 skill 規則與截圖是否一致
- `skill-validation`: skill 生成後自動驗證 key facts
- `auto-dream`: 測試完成後自動整理學習
- `test-plan-versioning`: 測試計畫版本管理

### Modified Capabilities
_無_

## Impact

- **Server**: pageScannerService（法官 prompt）、skillService（驗證 + dream）、testRunner（dream 觸發 + 版控儲存）
- **DB**: 新增 `test_plan_versions` 表
- **Web**: 專案頁面新增版本歷史 UI

## 範圍外

- 不做跨 project 的 skill 學習（dream 只更新當前 project）
- 不做 diff 視覺化（只列出版本清單，不做 side-by-side diff）
- 不做 dream 排程（只在測試完成時觸發，不做閒置觸發）
