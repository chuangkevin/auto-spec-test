# Production Server

## 需求
- Server 使用 tsc 編譯後的 JS 執行，不使用 tsx dev mode
- 30 分鐘連續使用不瞬斷
- Playwright browser context 最多 3 個同時存在
- Session 30 分鐘 TTL 自動回收

## 驗收條件
- [ ] `pnpm build:server` 成功編譯到 `packages/server/dist/`
- [ ] `pnpm start:server` 用 node 執行編譯後的 JS
- [ ] 連續跑 3 次 E2E 測試不瞬斷
- [ ] 同時建立 4 個 session 時，最舊的自動關閉
- [ ] Session 閒置 30 分鐘後自動回收
