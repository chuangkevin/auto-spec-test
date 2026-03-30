## Context

目前 `pageScannerService.scanPage()` 的 prompt 要求 AI 對每個 DOM 元件逐一產出驗證型測試（「按鈕可見嗎」「文字正確嗎」），結果是一堆無用的淺層測試。評判系統（三法官）只看最終截圖判 PASS/FAIL，缺乏步驟執行上下文，導致誤判率高。AI 討論（Echo/Lisa/Bob）的輸出沒有被有效利用於測試案例生成。

**現狀問題：**
1. scanPage prompt 引導 AI 產出「元件存在性驗證」而非「使用者流程測試」
2. selector 規則允許 `tag.class` 和位置型選擇器，容易 timeout
3. 法官只收到一張截圖 + 預期結果文字，不知道測試步驟是否真的執行了
4. 討論 Agent 的輸出只是展示用，沒有回饋到 scanPage 的 prompt

## Goals / Non-Goals

**Goals:**
- scanPage 產出以使用者旅程為核心的測試案例（登入→操作→驗證）
- selector 強制使用穩定的語意型選擇器
- 評判時提供完整步驟執行記錄（每步截圖 + 動作描述）
- 討論 Agent 的建議直接影響測試案例生成

**Non-Goals:**
- 不改 browserService / Playwright 底層
- 不改前端 UI
- 不改 DB schema
- 不改 WS 協定
- 不做跨頁面多步驟流程（如：登入→建立訂單→結帳→驗證）

## Decisions

### D1: scanPage prompt 從「元件清單」改為「使用者旅程」

**選擇：** 重寫 prompt，要求 AI 先識別頁面的核心功能（而非元件），再為每個功能設計使用者操作流程。

**替代方案：** 保留元件清單，在後處理階段將元件測試合併為流程。
→ 否決：後處理無法理解業務邏輯，合併結果仍然是機械式的。

**新 prompt 結構：**
```
1. 先看截圖 + DOM，識別頁面的「核心功能」（登入、搜尋、篩選、CRUD...）
2. 為每個功能設計 1-3 個使用者旅程（happy path + edge case）
3. 每個旅程是 2-5 步的操作序列
4. 只有在 DOM 中能找到對應 selector 時才產出該步驟
```

### D2: selector 策略收緊

**選擇：** 完全禁止位置型 selector，優先順序改為：
1. `text=XXX`（Playwright text selector）
2. `role=XXX[name=YYY]`（ARIA role）
3. `#id`
4. `[data-testid]`
5. 如果以上都沒有 → 不產出這個步驟

**理由：** text 和 role selector 最穩定，不受 DOM 結構變動影響。Playwright 原生支援這些 selector。

### D3: 評判提供完整步驟上下文

**選擇：** 在 `executeTestCase` 被呼叫時，除了最終截圖，還傳入每個步驟的執行記錄（動作、截圖、成功/失敗）。

**實作方式：** testRunner 的步驟執行迴圈已經在每步收集 before/after 截圖。將這些截圖組成摘要文字（不用全傳圖片，太多 token），改為傳：
- 每步的動作描述 + 成功/失敗
- 最終截圖（仍為圖片）
- 頁面狀態摘要（URL、已登入使用者等）

### D4: 討論結果影響測試生成

**選擇：** `testOrchestrator.discuss()` 的輸出格式化為結構化建議（測試重點、風險區域），直接注入 scanPage prompt 的上下文。

**目前問題：** discuss 的輸出是自由文字，scanPage 完全沒收到這些資訊。

## Risks / Trade-offs

- **Token 用量增加** → 步驟摘要用文字而非圖片，控制在 ~500 tokens 內
- **測試案例數量減少**（12-18 → 6-10）→ 可接受，品質比數量重要
- **text selector 可能匹配多個元素** → prompt 中要求 AI 使用足夠具體的文字
- **向後不相容** → prompt 改動後舊的測試案例格式可能不同，但因為每次都是重新生成所以無影響
