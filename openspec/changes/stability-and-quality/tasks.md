# Tasks: stability-and-quality

## Task 1: Production Server Build ✅ DONE

**Spec**: production-server
**Size**: M
**Files**: `packages/server/package.json`, `packages/server/tsconfig.build.json`, `package.json`

- [x] 加入 `build` script: `tsc -p tsconfig.build.json` + 複製 migrations（package.json scripts.build）
- [x] 加入 `start` script: `node dist/index.js`（package.json scripts.start）
- [x] 確認 tsconfig 的 `module`/`target` 設定正確（tsconfig.build.json: ES2022 + NodeNext）
- [x] 測試：`pnpm build && pnpm start` 能啟動（start.sh 存在，dist/index.js 可執行）
- [x] 更新 .env.example 加入 NODE_ENV=production

**驗證**: `curl http://localhost:4001/api/health` 回傳 OK

---

## Task 2: Playwright Session Pool + TTL ✅ DONE

**Spec**: production-server
**Size**: M
**Files**: `packages/server/src/services/browserService.ts`

- [x] 加入 MAX_SESSIONS 常數（預設 3，可用 env MAX_BROWSER_SESSIONS 覆蓋）
- [x] 每個 session 記錄 `createdAt` 時間戳
- [x] `createSession` 時檢查：如果已滿，關閉最舊且非活躍的 session（LRU eviction，保護 activeSessionIds）
- [x] 加入 cleanup interval（每 5 分鐘），關閉超過 30 分鐘的 session（SESSION_TTL_MS）
- [x] 共用一個 browser instance（不同 context）— ensureBrowser() lazy init

**驗證**: 建立 4 個 session → 最舊且非活躍的自動被關閉

---

## Task 3: DOM Tree Extraction ✅ DONE

**Spec**: dom-based-scanning
**Size**: L
**Files**: `packages/server/src/services/browserService.ts`

- [x] 新增 `getDomTree(sessionId)` 方法
- [x] 用 `page.evaluate` 遍歷 DOM，產出結構化 tree
- [x] 每個節點：tag, id, className, text(truncated), attributes(data-testid, aria-label, name, type, href, placeholder, role, value, for)
- [x] 深度限制 3 層（MAX_DEPTH=3），每層最多 20 個子節點（MAX_CHILDREN=20）
- [x] 跳過 SCRIPT/STYLE/SVG/NOSCRIPT/LINK/META/BR/HR 標籤
- [x] 回傳格式：nested JSON `{ tag, id, class, text, attrs, selector, children[] }`

**驗證**: 對 example.com 回傳合理的 tree 結構

---

## Task 4: AI Scan Prompt 改用 DOM Tree ✅ DONE

**Spec**: dom-based-scanning
**Size**: M
**Files**: `packages/server/src/services/pageScannerService.ts`, `packages/server/src/routes/testRunner.ts`

- [x] scan route 呼叫 `getDomTree` 取得 DOM tree
- [x] 將 DOM tree 以 indent 格式加入 AI prompt（formatDomTree helper）
- [x] 調整 prompt：使用 DOM tree 中的 id/data-testid/class 產出 selector，優先順序 #id > [data-testid] > [placeholder] > [aria-label]/[name] > role > text
- [x] 保留截圖（AI 用截圖理解頁面視覺、用 DOM 產出 selector）
- [x] scanPage 接受 domTree 參數，整合進 prompt

**驗證**: API 測試 scan 回傳的 selector 能被 Playwright 找到

---

## Task 5: 即時互動 — WS 推送點擊後截圖 ✅ DONE

**Spec**: realtime-interaction
**Size**: M
**Files**: `packages/server/src/routes/testRunner.ts`, `packages/server/src/routes/ws.ts`, `packages/web/src/components/BrowserViewer.tsx`

- [x] POST /click 執行後，立即截圖並透過 WS broadcast 推送（含 pageInfo）
- [x] POST /type 執行後，同樣 WS 推送截圖（含 pageInfo）
- [x] POST /key 執行後，同樣 WS 推送截圖（含 pageInfo）
- [x] 前端 BrowserViewer 移除 setTimeout polling，只靠 WS 更新（見 handleClick 註解）
- [x] manual 狀態下截圖串流間隔較慢（1500ms vs 500ms）

**驗證**: 點擊 → 200ms 內看到截圖更新

---

## Task 6: 打字支援完善 ✅ DONE

**Spec**: realtime-interaction
**Size**: S
**Files**: `packages/web/src/components/BrowserViewer.tsx`, `packages/server/src/routes/testRunner.ts`

- [x] 前端攔截所有 keydown 事件（handleKeyDown callback on container div）
- [x] Backspace/Delete/Enter/Tab/Escape/Arrow keys → POST /key { key }
- [x] 可列印字元 → POST /type { text: char }（合併發送）
- [x] 加入 focus indicator（聚焦後顯示「已聚焦，可打字」綠色提示，帶 animate-pulse）
- [x] 加入 debounce（連續打字合併為一次 /type 呼叫，100ms timeout via typeBuffer + typeTimer）

**驗證**: 在 input 欄位打字「admin」能正確輸入

---

## Task 7: E2E 驗證全流程 ⬜ PENDING

**Spec**: all
**Size**: M
**Files**: e2e tests

- [ ] 用 API 跑完整 E2E：login → start → click(manual) → type → screenshot → explore → discuss → scan → execute → results → report
- [ ] 確認 production build 下全流程通過
- [ ] 確認 3 次連續測試不瞬斷
- [ ] 更新 openspec status

**驗證**: 全部通過，commit + push

**備註**: 目前有個別功能的 e2e 測試（01-login ~ 06-settings），但尚未有串接完整流程的單一 E2E 測試。
