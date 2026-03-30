## Context

系統功能 18/18 完成，但穩定性和品質問題嚴重影響可用性。Server 使用 tsx dev mode（即時編譯 + watch），Playwright headless browser 無記憶體限制，AI 掃描只靠截圖猜 selector。需要在不改動功能的前提下提升穩定性和品質。

## Goals / Non-Goals

**Goals:**
- Server 在 30 分鐘連續使用下不瞬斷
- AI 產出的 selector 準確率從 ~30% 提升到 ~80%
- 互動式瀏覽器點擊後 200ms 內看到截圖更新
- 手動登入流程能完成打字 + 點擊 + Enter

**Non-Goals:**
- 不加新功能
- 不改 DB schema
- 不改 UI 風格
- 不換 AI 模型

## Decisions

### 1. Production Server 方案

**選擇：tsc 編譯 + node 直接執行**

替代方案：
- Docker + pm2 → 太重，開發階段不需要
- tsx --no-watch → 還是即時編譯，不夠穩定
- esbuild bundle → 可行但需處理 native modules (better-sqlite3)

做法：
```
tsc --outDir dist → node dist/index.js
package.json: "start": "node dist/index.js"
```
開發時用 tsx watch，production 用編譯後的 JS。

### 2. Playwright 記憶體管理

**選擇：session pool + 自動回收**

- 最多同時 3 個 browser context
- 每個 session 30 分鐘 TTL，超時自動關閉
- 新 session 建立時，如果已滿，關閉最舊的
- 用 `browserContext` 而非 `browser` 級別隔離（共用一個 browser process）

### 3. DOM-Based Scanning

**選擇：提供完整 DOM 結構 + 截圖雙管齊下**

現狀：只給 AI 一張截圖 + 元素列表（tag + text + selector）
改進：加入每個元素的完整屬性和父子關係

```
元素 1: <button id="login-btn" class="btn-primary" text="登入">
  父: <div class="auth-section">
  子: <span class="icon">👤</span>
```

這讓 AI 能用 id/class/data-testid 產出準確的 selector，不用猜。

### 4. 即時互動

**選擇：點擊後透過 WS 立即推送截圖**

現狀：點擊 → POST /click → 500ms setTimeout → GET /screenshot
改進：點擊 → POST /click → server 截圖 → WS 推送 → 前端更新

延遲從 ~800ms 降到 ~200ms。

打字支援：前端攔截所有 keydown 事件 → POST /type → WS 推送截圖

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| tsc 編譯後 import 路徑可能出錯 | tsconfig 設定 moduleResolution: bundler, 測試編譯結果 |
| Session pool 3 個可能不夠 | 可配置上限，用 env 變數 |
| DOM tree 太大超過 Gemini token limit | 限制深度 3 層，每層最多 20 個元素 |
| 即時推送截圖增加 WS 頻寬 | 只在互動模式推送，非互動時維持原有 interval |

## Migration Plan

1. 加入 `tsc` build script + `start` script
2. 修改 browserService（session pool + TTL）
3. 修改 pageScannerService（DOM tree prompt）
4. 修改 ws.ts + testRunner（即時推送）
5. 修改 BrowserViewer（WS 驅動更新）
6. 測試：API E2E 全流程 → 前端手動測試
7. 更新 openspec status
