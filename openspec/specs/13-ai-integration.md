# AI 整合規格

使用 Gemini 2.5 Flash，共有 5 個 AI 整合點。

## 1. 規格書解析

- **輸入**：原始規格書純文字（多檔案合併）
- **輸出**：結構化規格大綱 Markdown
- **Prompt 目標**：提取功能需求、業務規則、UI 描述、資料流程

## 2. 測試腳本產出

- **輸入**：確認後的規格大綱 + 產品類型
- **輸出**：符合測試腳本格式規範的 Markdown
- **Prompt 目標**：涵蓋功能測試、UI 測試、邊界測試、錯誤處理測試

## 3. 頁面元件掃描（URL 快速測試用）

- **輸入**：頁面截圖（JPEG base64）+ DOM 結構（精簡版）+ 規格書（若有附加）
- **輸出**：結構化的元件清單 + 測試任務清單（JSON）
- **輸出格式**：

```jsonc
{
  "components": [
    { "type": "form", "name": "登入表單", "elements": [
      { "type": "input", "label": "帳號", "selector": "#username" },
      { "type": "input", "label": "密碼", "selector": "#password" },
      { "type": "button", "label": "登入", "selector": "#login-btn" }
    ]},
    { "type": "nav", "name": "主導覽列", "elements": [...] }
  ],
  "testCases": [
    {
      "id": "TC-001",
      "name": "正確帳密登入",
      "category": "functional",
      "priority": "P0",
      "steps": ["輸入帳號 admin", "輸入密碼 ****", "點擊登入按鈕"],
      "expected": "頁面跳轉至首頁，顯示歡迎訊息",
      "verifications": ["URL 變為 /dashboard", "頁面包含歡迎文字"]
    }
  ]
}
```

- **Prompt 目標**：
  - 辨識所有可互動 UI 元件並分類
  - 產出正向測試、負向測試、邊界測試、UI 測試
  - 若有規格書，對照規格補充測試案例，並標記「規格有但頁面缺少」的差異
  - 為每個元件產出對應的 CSS selector

## 4. 測試執行 Agent（內嵌瀏覽器驅動）

- **運作模式**：逐案例、逐步驟的 Loop — 截圖+DOM → AI 判斷 → 操作指令 → 執行 → 下一步
- **輸入**（每步迴圈）：
  - 當前測試案例與步驟描述
  - 瀏覽器即時截圖（JPEG base64）
  - 頁面 DOM 結構（精簡版，移除 script/style）
  - 前一步的執行結果
- **輸出**（每步迴圈）：
  - 操作指令：`click(x, y)` / `type(selector, text)` / `navigate(url)` / `wait(ms)` / `scroll(direction)`
  - 步驟狀態判斷：成功/失敗/需重試
  - 驗證點判斷：逐一判定 pass/fail + 原因說明
- **Prompt 目標**：準確解讀腳本步驟，根據截圖定位 UI 元素，正確操作瀏覽器，客觀判斷驗證點

## 5. 測試報告產出

- **輸入**：所有測試案例的執行紀錄（步驟、截圖、判斷結果）
- **輸出**：符合測試報告格式的 Markdown
- **Prompt 目標**：彙整結果、分類 Bug 嚴重度、提供修復建議
