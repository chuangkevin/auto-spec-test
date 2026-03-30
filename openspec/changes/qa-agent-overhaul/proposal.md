## Why

目前 AI 產出的測試案例全是淺層 UI 驗證（「標題存在嗎」「按鈕可見嗎」），對 PM/QA 零參考價值。測試報告中的 FAIL 有一半是 AI 判斷錯誤而非真正的 Bug。selector 使用 `nth-of-type` 等位置型選擇器導致執行 timeout。整個測試流程從生成到評判都需要重構。

## What Changes

- **重寫 scanPage prompt**：從「元件清單驗證」改為「使用者旅程測試」，產出有意義的 E2E 流程
- **改進 selector 策略**：強制使用語意型 selector（text content、role、aria-label），禁用位置型 selector
- **重構評判 prompt**：法官需要知道完整執行過程（所有步驟截圖），而非只看最終截圖就判 PASS/FAIL
- **加入狀態感知**：AI 必須理解當前頁面狀態（已登入/未登入），不產出矛盾的測試案例
- **改進討論 Agent**：Echo/Lisa/Bob 的討論結果必須直接影響測試案例生成，而非只是裝飾性輸出

## Capabilities

### New Capabilities
- `flow-based-test-generation`: 基於使用者旅程的測試案例生成，取代逐元件驗證
- `state-aware-evaluation`: 狀態感知的測試評判，法官接收完整步驟執行記錄而非單張截圖

### Modified Capabilities
_無需修改既有 spec 層級需求_

## Impact

- `packages/server/src/services/pageScannerService.ts` — scanPage prompt 重寫、評判 prompt 重寫
- `packages/server/src/services/testOrchestrator.ts` — 討論結果格式化改進
- `packages/server/src/routes/testRunner.ts` — 執行時收集步驟截圖傳給評判

## 範圍外

- 不改變 browserService 底層 Playwright 操作
- 不改變前端 UI（TestExecutionPanel）
- 不改變資料庫 schema
- 不改變 WebSocket 通訊協定
