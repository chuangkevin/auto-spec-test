# Auto Spec Test

自動化規格測試工具 — 協助 PM、QA 人員將規格書自動轉換為測試腳本，並執行瀏覽器自動化測試，產出含 Bug 清單的測試報告。

## 核心功能

1. **規格書 → 測試腳本**：上傳規格書（.md / .docx / .xls / .csv），AI 自動產出結構化測試腳本
2. **內嵌瀏覽器即時視覺化測試**：系統內嵌瀏覽器畫面，AI Agent 逐條執行測試案例，使用者可即時觀看操作過程，支援暫停/繼續/跳過/終止控制
3. **測試報告產出**：自動彙整測試結果，條列 Bug 清單與嚴重度分級，含每步驟截圖

## 技術棧

| 項目 | 技術 |
|------|------|
| 前端 | React / Next.js |
| 後端 | Node.js / Fastify |
| 資料庫 | SQLite (better-sqlite3) |
| AI 模型 | Gemini 2.5 Flash |
| 瀏覽器自動化 | Playwright |
| 任務佇列 | BullMQ |
| 通知整合 | Slack Webhook |

## 專案結構

```
auto-spec-test/
├── original.md          # 原始需求文件
├── spec.md              # 完整規格書
├── README.md
├── packages/
│   ├── web/             # 前端應用
│   └── server/          # 後端服務
│       ├── src/
│       │   ├── routes/        # API 路由
│       │   ├── services/      # 核心服務
│       │   │   ├── fileParser.ts      # 檔案解析
│       │   │   ├── geminiKeys.ts      # API Key Pool
│       │   │   ├── aiService.ts       # AI 整合
│       │   │   ├── testOrchestrator.ts # 測試編排（逐案例調度）
│       │   │   ├── browserDriver.ts   # Playwright 瀏覽器控制 + 截圖串流
│       │   │   └── slackNotifier.ts   # Slack 通知
│       │   └── db/
│       │       └── migrations/        # 資料庫遷移
│       └── uploads/           # 上傳檔案儲存
```

## 開發階段

| 階段 | 範圍 |
|------|------|
| Phase 1 (MVP) | 專案管理 + 規格書上傳 + AI 產出腳本 + 下載 |
| Phase 2 | 測試執行（Playwright + Gemini Agent）+ 測試報告 |
| Phase 3 | 資料歸檔 + 系統測試獨立入口 + 測試記錄 |
| Phase 4 | API Key Pool + Slack 整合 + 使用者管理 |
