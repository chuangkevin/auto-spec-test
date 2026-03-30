## 1. 重寫 scanPage prompt — 流程導向測試生成

- [x] 1.1 重寫 `pageScannerService.scanPage()` 的 prompt：從「列出元件 + 逐一驗證」改為「識別核心功能 → 設計使用者旅程 → 產出 6-10 個流程測試」。驗收：prompt 明確禁止元件存在性驗證，要求每個 TC 包含 2-5 步連續操作。
- [x] 1.2 更新 scanPage prompt 的 selector 規則：移除 `tag.class` 和位置型 selector，改為 text > role > #id > data-testid 優先順序。驗收：prompt 中明確禁止 nth-of-type、nth-child、div>div>button 等模式。
- [x] 1.3 在 scanPage prompt 中加入狀態感知指令：告知 AI 當前頁面狀態（URL、標題、是否已登入），要求不產出與狀態矛盾的測試。驗收：prompt 包含「如果截圖顯示已登入，不要產出未登入重導測試」等指令。

## 2. 討論 Agent 輸出整合

- [x] 2.1 修改 `testOrchestrator.formatDiscussionForPrompt()` 輸出結構化建議（測試重點清單、風險區域、建議測試的功能），而非自由文字對話。驗收：輸出為 bullet list 格式，每項有明確的測試方向。
- [x] 2.2 在 `testRunner.ts` 的掃描流程中，將討論結果注入 scanPage 的 specContent 或新增參數。驗收：scanPage prompt 中包含討論 Agent 的建議。

## 3. 評判系統改進 — 狀態感知評判

- [x] 3.1 修改 `testRunner.ts` 的步驟執行迴圈，收集每步的執行摘要（動作、target、成功/失敗、錯誤訊息），存入陣列傳給 executeTestCase。驗收：executeTestCase 被呼叫時包含 stepsSummary 參數。
- [x] 3.2 重寫 `pageScannerService.singleJudge()` 的 prompt：加入步驟執行摘要 + 頁面狀態上下文。要求法官基於步驟記錄 + 截圖綜合判斷。驗收：prompt 包含步驟記錄區塊，actualResult 描述具體觀察而非模糊語句。
- [x] 3.3 重寫 `pageScannerService.arbitrate()` 的 prompt：加入相同的步驟上下文。驗收：仲裁 prompt 包含步驟記錄。

## 4. 自主登入恢復機制

- [x] 4.1 在 `testRunner.ts` 的每個測試案例執行前，加入登入狀態偵測：截圖 + AI 判斷當前是否在登入頁面（有 password input、login/登入按鈕、URL 含 login/signin）。驗收：能偵測到登入頁面並觸發自動登入。
- [x] 4.2 實作自動登入恢復邏輯：偵測到登入頁時，用 AI 分析頁面找到可點擊的帳號/身份選項（如 admin 按鈕），自動點擊登入，等待導航完成後繼續測試。驗收：登出後下一個測試案例能自動重新登入。
- [x] 4.3 在 `browserService` 中加入 `detectLoginPage()` 方法：分析 DOM 是否包含登入相關元素（password input、login button），回傳布林值 + 可點擊的帳號元素列表。驗收：不依賴 AI 呼叫，純 DOM 分析即可快速偵測。
- [x] 4.4 登入恢復失敗時的降級處理：如果自動登入失敗（找不到帳號、點擊後仍在登入頁），觸發手動介入模式（通知前端使用者手動登入）。驗收：不會因為登入失敗而無限重試。

## 5. 整合測試

- [ ] 5.1 用目標頁面跑完整流程：掃描→討論→生成→執行→評判→報告，確認產出的測試案例是流程型而非元件驗證型。驗收：報告中無「驗證按鈕可見」「驗證標題文字」等廢測試。（需手動測試）
