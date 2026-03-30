# Tasks: stability-and-quality

## Task 1: Production Server Build
**Spec**: production-server
**Size**: M
**Files**: `packages/server/package.json`, `packages/server/tsconfig.json`, `package.json`

- [ ] 加入 `build:server` script: `cd packages/server && tsc --outDir dist --skipLibCheck`
- [ ] 加入 `start:server` script: `cd packages/server && node dist/index.js`
- [ ] 確認 tsconfig 的 `module`/`target` 設定正確（ESM output）
- [ ] 測試：`pnpm build:server && pnpm start:server` 能啟動
- [ ] 更新 .env.example 加入 NODE_ENV=production

**驗證**: `curl http://localhost:4001/api/health` 回傳 OK

---

## Task 2: Playwright Session Pool + TTL
**Spec**: production-server
**Size**: M
**Files**: `packages/server/src/services/browserService.ts`

- [ ] 加入 MAX_SESSIONS 常數（預設 3，可用 env 覆蓋）
- [ ] 每個 session 記錄 `createdAt` 時間戳
- [ ] `createSession` 時檢查：如果已滿，關閉最舊的 session
- [ ] 加入 cleanup interval（每 5 分鐘），關閉超過 30 分鐘的 session
- [ ] 共用一個 browser instance（不同 context）

**驗證**: 建立 4 個 session → 第 1 個自動被關閉

---

## Task 3: DOM Tree Extraction
**Spec**: dom-based-scanning
**Size**: L
**Files**: `packages/server/src/services/browserService.ts`

- [ ] 新增 `getDomTree(sessionId)` 方法
- [ ] 用 `page.evaluate` 遍歷 DOM，產出結構化 tree
- [ ] 每個節點：tag, id, className, text(truncated), attributes(data-testid, aria-label, name, type, href, placeholder)
- [ ] 深度限制 3 層，每層最多 20 個子節點
- [ ] 跳過 script/style/svg/noscript 標籤
- [ ] 回傳格式：nested JSON `{ tag, id, class, text, attrs, children[] }`

**驗證**: 對 example.com 回傳合理的 tree 結構

---

## Task 4: AI Scan Prompt 改用 DOM Tree
**Spec**: dom-based-scanning
**Size**: M
**Files**: `packages/server/src/services/pageScannerService.ts`, `packages/server/src/routes/testRunner.ts`

- [ ] scan route 呼叫 `getDomTree` 取得 DOM tree
- [ ] 將 DOM tree 以 indent 格式加入 AI prompt
- [ ] 調整 prompt：「使用 DOM tree 中的 id/data-testid/class 產出 selector，優先用 #id > [data-testid] > .class」
- [ ] 保留截圖（AI 用截圖理解頁面視覺、用 DOM 產出 selector）
- [ ] 測試：對 buy.houseprice.tw 掃描，80% selector 有效

**驗證**: API 測試 scan 回傳的 selector 能被 Playwright 找到

---

## Task 5: 即時互動 — WS 推送點擊後截圖
**Spec**: realtime-interaction
**Size**: M
**Files**: `packages/server/src/routes/testRunner.ts`, `packages/server/src/routes/ws.ts`, `packages/web/src/components/BrowserViewer.tsx`

- [ ] POST /click 執行後，立即截圖並透過 WS 推送（不等前端 polling）
- [ ] POST /type 執行後，同樣 WS 推送截圖
- [ ] POST /key 執行後，同樣 WS 推送截圖
- [ ] 前端 BrowserViewer 移除 setTimeout polling，只靠 WS 更新
- [ ] 只在 manual/preview 狀態時啟用即時推送

**驗證**: 點擊 → 200ms 內看到截圖更新

---

## Task 6: 打字支援完善
**Spec**: realtime-interaction
**Size**: S
**Files**: `packages/web/src/components/BrowserViewer.tsx`, `packages/server/src/routes/testRunner.ts`

- [ ] 前端攔截所有 keydown 事件（不只 Enter/Tab/Escape）
- [ ] Backspace → POST /key { key: 'Backspace' }
- [ ] 可列印字元 → POST /type { text: char }
- [ ] 加入 focus indicator（點擊截圖後顯示「已聚焦，可打字」提示）
- [ ] 加入 debounce（連續打字合併為一次 /type 呼叫，100ms）

**驗證**: 在 input 欄位打字「admin」能正確輸入

---

## Task 7: E2E 驗證全流程
**Spec**: all
**Size**: M
**Files**: e2e tests

- [ ] 用 API 跑完整 E2E：login → start → click(manual) → type → screenshot → explore → discuss → scan → execute → results → report
- [ ] 確認 production build 下全流程通過
- [ ] 確認 3 次連續測試不瞬斷
- [ ] 更新 openspec status

**驗證**: 全部通過，commit + push
