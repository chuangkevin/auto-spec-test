# 功能模組：智慧探索式測試（Multi-Agent Architecture）

<!-- status: pending -->

## 設計概念

從「按腳本執行」升級為「智慧探索式測試」。多個 AI Agent 協作，模擬真人 QA 的測試思維。

## Agent 角色定義

### Agent 1: 探索者 (Explorer)
- 掃描前先自由探索頁面 3-5 分鐘
- 點擊每個可互動元件，觀察行為
- 記錄：哪些是 toggle、哪些會導航、哪些會開 modal
- 建立「頁面行為圖譜」

### Agent 2: 分析者 (Planner)
- 接收探索者的行為圖譜
- 根據行為規劃有意義的測試案例
- 排除無意義的測試（例如：不測 toggle 的單次點擊）
- 設計邊界測試（空值、極端值）

### Agent 3: 執行者 (Executor)
- 逐步執行測試案例
- 遇到意外行為時「自問」：
  - 「這個變化是預期的嗎？」
  - 「是不是我操作順序不對？」
  - 「要不要重試？」
- 可以自行調整步驟（重試、換 selector、跳過）

### Agent 4: 裁判 (Judge)
- 收到執行者的結果和截圖
- 綜合判斷 pass/fail
- 考慮上下文（toggle 行為、動畫延遲、非同步載入）
- 給出判斷理由

## 手動登入模式

### 流程
1. 載入目標 URL
2. 系統偵測頁面是否像登入頁（有 password input、login button 等）
3. 如果是 → 提示「偵測到登入頁面，請先手動登入」
4. 使用者在內嵌瀏覽器操作登入
5. 使用者點「登入完成，開始掃描」
6. AI 從登入後的頁面開始探索和測試

### 偵測登入頁面的條件
- 有 `input[type="password"]`
- 有 text 包含「登入」「Login」的按鈕
- 頁面元素少於 20 個可互動元件
- URL 包含 login、signin、auth

## AI 探索階段

### 探索行為
```
1. 掃描所有可互動元件
2. 逐一點擊，截圖比對前後差異
3. 分類元件行為：
   - toggle: 點兩次回到原狀態
   - navigation: 點一次離開當前頁
   - modal: 點一次出現覆蓋層
   - dropdown: 點一次出現選項列表
   - form_submit: 需要先填入資料
   - no_effect: 點了沒反應
4. 產出行為圖譜 JSON
```

### 行為圖譜格式
```json
{
  "behaviors": [
    {
      "selector": "#theme-toggle",
      "type": "toggle",
      "description": "切換明暗模式",
      "stateA_screenshot": "base64...",
      "stateB_screenshot": "base64..."
    },
    {
      "selector": "#login-btn",
      "type": "navigation",
      "description": "導航到登入頁",
      "destination": "/login"
    }
  ]
}
```

## AI 自問機制

### 執行時自問 Prompt
```
你剛才執行了 [action] 在 [selector] 上。
執行前截圖：[before]
執行後截圖：[after]

請回答：
1. 頁面發生了什麼變化？
2. 這個變化是預期的嗎？（考慮元件類型和操作）
3. 需要額外操作嗎？（例如：toggle 需要再按一次恢復）
4. 這一步算成功還是失敗？

只回傳 JSON: { "change": "描述", "expected": true/false, "needRevert": true/false, "passed": true/false }
```

## Multi-Agent 討論機制

### 判定流程
```
執行者完成 TC → 截圖 + 結果 →

裁判 A (嚴格): 分析結果
裁判 B (寬鬆): 分析結果

if A == B:
  最終結果 = A 的判斷
else:
  裁判 C (仲裁): 看 A 和 B 的理由，做最終判斷
```

### API 實作
- 每次判定呼叫 2-3 次 Gemini（不同 temperature）
- 取多數決
- 分歧時記錄理由供人工審閱
