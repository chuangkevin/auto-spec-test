# Auto Spec Test

自動化規格測試工具 — 協助 PM、QA 人員進行系統測試的自動化工具。支援規格驅動測試和 URL 探索測試兩種模式，所有測試皆透過內嵌瀏覽器即時視覺化呈現。

## 核心功能

### 1. 規格書驅動測試
上傳規格書（.md / .docx / .xls / .csv），AI 自動產出結構化測試腳本，逐條執行並產出報告。

### 2. URL 智慧探索測試
貼上網址，AI 自動掃描頁面元件、多 Agent 討論測試策略、產出測試計畫並執行。

### 3. AI 多 Agent 協作
- **Explorer**：自動點擊頁面元素，分類行為（toggle / navigation / modal / dropdown）
- **Echo**（QA 策略師）：分析測試重點
- **Lisa**（前端技術專家）：補充技術觀點
- **Bob**（UX 體驗分析師）：使用者體驗角度
- **三法官評判**：嚴格 + 寬鬆 + 仲裁，多角度判定 PASS/FAIL

### 4. 深度探索（超廣無邊際瀏覽）
AI 自動跟隨頁面連結，探索 2-3 層深的子頁面，建立整站頁面地圖，產出跨頁面的使用者旅程測試。

### 5. 自動登入恢復
測試過程中遇到登入頁面，自動嘗試三層策略恢復：
1. 還原 Session State（cookies + localStorage）
2. 自動點擊帳號選擇按鈕
3. 降級為手動介入模式

### 6. AI Skills（領域知識系統）
匯入 SKILL.md 領域知識檔案，AI Agent 在討論和測試生成時自動篩選相關 skill 注入，產出更精準的測試案例。
- 與 project-bridge 格式相容（YAML frontmatter + Markdown content）
- 智慧篩選：AI 判斷哪些 skill 跟目標頁面相關，只注入相關的
- 系統設定 UI 支援拖拉匯入、啟用/停用、編輯

### 7. 測試報告
- Markdown 格式測試報告，含 Bug 清單與重現步驟
- 每步驟截圖 + 執行時間追蹤
- 可疑的快速 PASS 自動標記
- 支援推送到 Gitea Issue

### 8. 整合
- **Gitea**：測試報告自動推送為 Issue
- **Slack**：測試完成 / 失敗時 Webhook 通知

## 技術棧

| 項目 | 技術 |
|------|------|
| 前端 | Next.js 15 (App Router), React, Tailwind CSS, TypeScript |
| 後端 | Node.js, Fastify, TypeScript |
| 資料庫 | SQLite (better-sqlite3) |
| AI 模型 | Gemini 2.5 Flash (Google Generative AI SDK) |
| 瀏覽器自動化 | Playwright |
| Monorepo | pnpm workspace |
| 通知整合 | Slack Webhook, Gitea API |

## 專案結構

```
auto-spec-test/
├── openspec/                    # OpenSpec 變更管理
│   ├── specs/                   # 產品規格書
│   └── changes/                 # 變更提案（qa-agent-overhaul, agent-skill-system）
├── packages/
│   ├── web/                     # 前端應用 (Next.js 15)
│   │   └── src/
│   │       ├── app/(main)/      # 頁面路由
│   │       ├── components/      # React 元件
│   │       │   ├── TestExecutionPanel.tsx  # 測試執行面板
│   │       │   └── SkillManager.tsx        # Skill 管理 UI
│   │       ├── lib/             # API client, auth
│   │       └── types/           # TypeScript 型別
│   └── server/                  # 後端服務 (Fastify)
│       └── src/
│           ├── routes/
│           │   ├── testRunner.ts      # 測試執行引擎 + WebSocket
│           │   ├── skills.ts          # Skill CRUD + 批次匯入
│           │   ├── projects.ts        # 專案管理
│           │   └── specifications.ts  # 規格書上傳解析
│           ├── services/
│           │   ├── pageScannerService.ts   # 頁面掃描 + 測試生成 + 評判
│           │   ├── testOrchestrator.ts     # 多 AI 討論協調
│           │   ├── explorerService.ts      # 元素行為探索 + 深度探索
│           │   ├── browserService.ts       # Playwright 封裝
│           │   ├── skillService.ts         # Skill 管理 + 智慧篩選
│           │   ├── selfQuestionService.ts  # AI 自問機制
│           │   └── reportService.ts        # 報告產生
│           └── db/
│               └── migrations/    # 001-005 資料庫遷移
```

## 快速開始

```bash
# 安裝
pnpm install

# 設定環境變數
cp .env.example .env
# 填入 Gemini API Key

# 啟動開發伺服器
pnpm --filter server dev   # 後端 http://localhost:4001
pnpm --filter web dev      # 前端 http://localhost:3000
```

## 測試流程

```
URL 探索模式：
  貼上網址 → 元素探索 → 深度探索 → AI 團隊討論 → 生成測試計畫 → 執行 → 報告

規格書模式：
  上傳規格書 → AI 解析大綱 → 確認 → 產出測試腳本 → 執行 → 報告
```

## 開發進度

| 功能 | 狀態 |
|------|------|
| 規格書解析 + 測試腳本生成 | ✅ 完成 |
| URL 快速測試（元素掃描 + 測試執行） | ✅ 完成 |
| 多 AI Agent 討論 + 三法官評判 | ✅ 完成 |
| 流程導向測試生成（取代元件驗證） | ✅ 完成 |
| 語意型 Selector 策略 + 自動修正 | ✅ 完成 |
| 深度探索（跨頁面站點地圖） | ✅ 完成 |
| 自動登入恢復 | ✅ 完成 |
| AI Skills 領域知識系統 | ✅ 完成 |
| 專案 test_url 記憶 | ✅ 完成 |
| 即時探索 WebSocket 廣播 | ✅ 完成 |
| Gitea 整合 | ✅ 完成 |
| Slack 通知 | ✅ 完成 |
| API Key Pool（輪替 + 429 retry） | ✅ 完成 |
