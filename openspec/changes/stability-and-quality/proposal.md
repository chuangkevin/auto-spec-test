## Why

系統功能已全部完成（18/18 spec done），但實際使用時存在三個嚴重問題：
1. **Server 不穩定** — tsx dev mode + Playwright 吃記憶體導致頻繁瞬斷，使用者操作被中斷
2. **測試案例品質低** — AI 用截圖猜 selector，對 SPA/動態頁面準確率極低
3. **互動式瀏覽器體驗差** — 點擊後 500ms 才更新截圖，手動登入流程不流暢

這些問題直接影響系統可用性，需優先解決。

## What Changes

- 將 server 從 tsx dev mode 改為 production build（tsc 編譯 + node 執行）
- 限制 Playwright 同時開啟的 browser context 數量（最多 3 個）
- AI 掃描改為 DOM 結構分析為主、截圖為輔（提供完整 DOM tree 而非只有 selector 列表）
- 互動式瀏覽器改用 WebSocket 即時推送點擊後截圖（不再 polling 500ms）
- 手動登入模式加入輸入框支援（不只點擊，還能打字）

## Capabilities

### New Capabilities
- `production-server`: Production build 流程（tsc 編譯、node 啟動、process manager）
- `dom-based-scanning`: DOM 結構分析取代截圖猜測，提升 selector 準確率
- `realtime-interaction`: 即時互動式瀏覽器（WebSocket 推送、打字支援、低延遲）

### Modified Capabilities
- `07-test-execution`: 加入 Playwright 記憶體限制和 session 上限
- `18-intelligent-testing`: AI 掃描改為 DOM-first 策略

## Impact

- `packages/server/package.json`: 加入 build script
- `packages/server/src/services/browserService.ts`: session 上限、記憶體管理
- `packages/server/src/services/pageScannerService.ts`: DOM tree prompt 取代 element list
- `packages/server/src/routes/ws.ts`: 點擊後即時推送截圖
- `packages/web/src/components/BrowserViewer.tsx`: 即時互動、打字支援
- `ecosystem.config.cjs` 或 `Dockerfile`: production 執行方式

## 範圍外

- 新功能開發（已完成的 18 個 spec 不變）
- UI 風格調整
- 資料庫 schema 變更
