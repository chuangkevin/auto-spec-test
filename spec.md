# Auto Spec Test - 自動化規格測試工具 完整規格書

## 1. 產品概述

### 1.1 產品定位
協助 PM、QA 人員進行系統測試的自動化工具。使用者上傳規格書，系統自動產出測試腳本，並可對目標網址執行自動化瀏覽器測試，最終產出含 Bug 清單的測試報告。

### 1.2 目標使用者
- PM（產品經理）：上傳規格書、檢視測試報告
- QA（測試人員）：編輯測試腳本、執行測試、分析報告
- 開發團隊負責人：檢視測試報告、追蹤 Bug

### 1.3 核心價值
- 規格書自動轉換為結構化測試腳本，減少人工撰寫成本
- 腳本格式標準化（Agent-Agnostic），可用於不同 AI Agent
- 瀏覽器自動化測試，模擬真實使用者操作
- 自動產出測試報告與 Bug 清單

### 1.4 技術決策摘要
| 項目 | 決策 |
|------|------|
| 測試執行方式 | 系統內嵌瀏覽器即時視覺化測試（Playwright + WebSocket 截圖串流） |
| AI 模型 | Gemini 2.5 Flash（私有部署/API） |
| API Key 管理 | 參考 project-bridge 的 key pool 設計（輪替、限流重試、用量追蹤） |
| 產品選項 | 使用者可自行建立與管理 |
| 腳本編輯 | 支援富文字 Markdown 編輯 + 表單介面新增測試案例 |
| 外部整合 | Slack 通知 |
| 語系 | 僅繁體中文 |
| 資料儲存 | SQLite |

---

## 2. 使用者與權限

### 2.1 角色定義
| 角色 | 說明 | 權限 |
|------|------|------|
| 管理員 | 系統管理者 | 所有操作 + 使用者管理 + 系統設定 |
| 一般使用者 | PM / QA | 建立專案、上傳規格、執行測試、檢視報告 |

### 2.2 認證方式
- 第一版：帳號密碼登入
- 預留 OAuth/SSO 擴充欄位

### 2.3 資料可見範圍
- 所有使用者可存取所有專案（小型團隊場景）
- 操作紀錄記錄「誰在什麼時候做了什麼」

---

## 3. 頁面架構（IA）

```
├── 登入頁
├── 首頁（儀表板：近期專案、最新測試摘要）
├── 測試專案
│   ├── 專案列表
│   └── 專案詳情頁
│       ├── Tab 1: 測試腳本（規格上傳 → 大綱確認 → 腳本產出 → 編輯確認）
│       ├── Tab 2: 進行測試（輸入網址 → 內嵌瀏覽器即時視覺化測試 → 逐案例執行）
│       └── Tab 3: 測試報告（歷次報告列表 → 報告詳情）
├── 規格書庫（資料歸檔，依產品分類）
├── 系統測試（獨立入口，不綁定專案）
├── 測試記錄（全域測試歷史）
└── 系統設定
    ├── 使用者管理
    ├── 產品管理（CRUD）
    ├── API Key 管理（key pool）
    ├── AI 模型設定
    └── Slack 整合設定
```

---

## 4. 功能模組一：測試專案管理

### 4.1 建立測試專案
**輸入欄位：**
| 欄位 | 類型 | 必填 | 說明 |
|------|------|------|------|
| 專案名稱 | text | 是 | 不可重複 |
| 產品 | select | 是 | 從使用者建立的產品清單中選擇 |
| 描述 | textarea | 否 | 專案說明 |

建立後自動跳轉至專案詳情頁。

### 4.2 專案列表
**列表欄位：**
- 專案名稱（可點擊進入）
- 產品名稱
- 狀態標籤：`草稿` / `已有腳本` / `測試中` / `已完成`
- 建立人
- 最近測試日期
- 建立日期

**操作：**
- 篩選：依產品、狀態
- 搜尋：關鍵字搜尋專案名稱
- 排序：依日期、名稱

### 4.3 專案詳情頁
- 上方顯示專案基本資訊（名稱、產品、描述）
- 三個 Tab：`測試腳本` / `進行測試` / `測試報告`
- **流程控制**：無測試腳本時，`進行測試` 和 `測試報告` Tab 顯示提示訊息但不可操作

---

## 5. 功能模組二：規格書上傳與測試腳本產出

### 5.1 檔案上傳
| 項目 | 規格 |
|------|------|
| 支援格式 | `.md` `.docx` `.xls` `.xlsx` `.csv` |
| 上傳方式 | 拖拉或點擊選取，支援多檔案 |
| 單檔上限 | 50MB |
| 單次上傳數量上限 | 20 個 |

上傳後顯示檔案清單，可刪除個別檔案。

### 5.2 規格解析與大綱產出（AI 步驟 1）
1. 系統解析所有上傳檔案，提取純文字內容
2. 將內容送至 Gemini 2.5 Flash，整理為結構化的規格大綱（.md）
3. 使用者在介面上預覽大綱
4. 可直接編輯大綱內容（Markdown 編輯器）
5. 確認大綱正確後，點擊「產出測試腳本」

### 5.3 測試腳本產出（AI 步驟 2）
1. AI 根據確認後的規格大綱產出測試腳本
2. 腳本格式依循第 8 節定義的標準結構
3. 使用者可：
   - **Markdown 編輯模式**：直接編輯腳本原始碼
   - **表單模式**：透過表單介面新增/編輯/刪除測試案例，調整優先級與分類
   - 兩種模式可切換，資料即時同步
4. 確認後儲存腳本

### 5.4 腳本操作
- 儲存至專案
- 下載為 `.md` 檔案
- 查看版本歷史（每次更新自動建立新版本）
- 切換至舊版本

---

## 6. 功能模組三：資料歸檔（規格書庫）

### 6.1 規格書列表頁
**篩選條件：** 產品（下拉選單）

**列表欄位：**
| 欄位 | 說明 |
|------|------|
| 規格書檔案 | 顯示檔名，點擊可下載原始檔案 |
| 測試腳本 | 點擊可下載 .md |
| 所屬專案 | 點擊可跳轉至專案頁面 |
| 產品名稱 | 歸屬的產品 |
| 上傳人員 | 上傳者名稱 |
| 更新日期 | 最後更新時間 |

### 6.2 卡片操作按鈕
- **更新**：跳轉至該專案的測試腳本 Tab，進行重新上傳與產出流程
- **刪除**：二次確認後刪除規格書及對應腳本

### 6.3 對應關係
- 一份規格書對應一份測試腳本（一對一）
- 刪除規格書時同步刪除對應腳本（需確認提示）

---

## 7. 功能模組四：測試執行（內嵌瀏覽器即時視覺化）

### 7.1 設計概念

系統內嵌瀏覽器畫面，AI Agent 逐條執行測試案例，使用者可在介面上即時觀看操作過程，如同一位自動化 QA 正在眼前操作。

**技術方案：** 後端 Playwright 操作瀏覽器，透過 WebSocket 即時串流截圖到前端顯示（約 2-4 fps），兼顧即時性與效能。

### 7.2 測試執行頁面佈局（Tab 2: 進行測試）

```
┌─────────────────────────────────────────────────────────────┐
│  測試設定列：[目標網址 ___________] [測試帳號] [測試密碼]       │
│             [執行模式: ◉自動 ○逐步] [▶ 開始測試]              │
├────────────────────────────────┬────────────────────────────┤
│                                │  測試案例清單               │
│                                │  ┌────────────────────────┐│
│     內嵌瀏覽器畫面              │  │ TC-001 登入功能    ✅   ││
│     (WebSocket 截圖串流)        │  │ TC-002 首頁顯示    ▶🔄 ││
│                                │  │ TC-003 搜尋功能    ⏳   ││
│     ┌────────────────────┐    │  │ TC-004 表單送出    ⏳   ││
│     │                    │    │  │ TC-005 權限控制    ⏳   ││
│     │   目標網站即時畫面   │    │  └────────────────────────┘│
│     │                    │    │                            │
│     │                    │    │  目前執行步驟               │
│     └────────────────────┘    │  ┌────────────────────────┐│
│                                │  │ 步驟 2/4: 在「帳號」    ││
│                                │  │ 欄位輸入 test@mail.com ││
│                                │  │                        ││
│                                │  │ AI 判斷：欄位已找到，   ││
│                                │  │ 正在輸入...             ││
│                                │  └────────────────────────┘│
├────────────────────────────────┴────────────────────────────┤
│  操作列：[⏸ 暫停] [▶ 繼續] [⏭ 跳過此案例] [⏹ 終止測試]      │
│  即時 Log：                                                  │
│  14:32:01 TC-001 步驟1 前往 /login ..................... ✅  │
│  14:32:03 TC-001 步驟2 輸入帳號 ........................ ✅  │
│  14:32:05 TC-001 步驟3 點擊登入 ........................ ✅  │
│  14:32:07 TC-001 驗證點: URL=/dashboard ................ ✅  │
│  14:32:08 TC-002 步驟1 前往 /home ................... 🔄   │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 從專案內發起測試

**設定欄位：**
| 欄位 | 類型 | 必填 | 說明 |
|------|------|------|------|
| 目標網址 | URL input | 是 | 驗證 URL 格式，測試前做連線檢查 |
| 測試帳號 | text | 否 | 目標網站的登入帳號 |
| 測試密碼 | password | 否 | 目標網站的登入密碼 |
| 執行範圍 | checkbox group | 否 | 可選擇特定測試案例（依分類或優先級篩選），預設全部執行 |
| 執行模式 | radio | 否 | **自動模式**（預設）：逐案例自動執行 / **逐步模式**：每個案例完成後暫停等待確認 |

自動使用該專案最新版的測試腳本。

### 7.4 從「系統測試」入口發起測試
- 輸入目標網址
- 選擇腳本來源：
  - **從專案選取**：下拉選單顯示所有專案名稱
  - **上傳腳本**：上傳 `.md` 檔案
- 其餘設定同 7.3

### 7.5 測試執行流程（逐案例執行）

```text
開始測試
  │
  ├─ 1. 後端建立 Playwright Browser Context
  │     └─ 開啟 WebSocket 連線，開始串流截圖
  │
  ├─ 2. 前端顯示內嵌瀏覽器畫面 + 測試案例清單
  │
  ├─ 3. AI Agent 取得第一個測試案例 (TC-001)
  │     ├─ 案例狀態更新為「執行中 ▶🔄」
  │     ├─ 逐步驟執行：
  │     │   ├─ 讀取步驟描述
  │     │   ├─ 截圖 + DOM → 送給 Gemini 2.5 Flash
  │     │   ├─ AI 回傳操作指令（點擊座標/輸入文字/導航）
  │     │   ├─ Playwright 執行操作
  │     │   ├─ 截圖回傳前端（使用者即時看到畫面變化）
  │     │   ├─ 步驟 Log 即時推送
  │     │   └─ 重複直到所有步驟完成
  │     ├─ 執行驗證點：
  │     │   ├─ AI 逐一判斷每個驗證點 pass/fail
  │     │   └─ 失敗的驗證點自動截圖保存
  │     └─ 案例結果：✅ PASS 或 ❌ FAIL
  │
  ├─ 4. 根據執行模式：
  │     ├─ 自動模式：直接進入下一個案例 (TC-002)
  │     └─ 逐步模式：暫停，等待使用者點擊「繼續」或「跳過」
  │
  ├─ 5. 重複步驟 3-4，直到所有案例完成
  │
  └─ 6. 測試結束，產出測試報告
```

### 7.6 即時互動控制

使用者在測試執行過程中可進行以下操作：

| 操作 | 說明 | 快捷鍵 |
|------|------|--------|
| **暫停** | 暫停目前測試，瀏覽器保持當前狀態 | `Space` |
| **繼續** | 從暫停處繼續執行 | `Space` |
| **跳過此案例** | 跳過目前案例（標記為 skip），進入下一個 | `S` |
| **終止測試** | 結束測試，已完成的案例仍產出報告 | `Esc` |
| **重測此案例** | 對失敗的案例重新執行（案例清單右鍵選單） | - |
| **標記為已知問題** | 手動將失敗案例標記為「已知問題」，不列入 Bug 清單 | - |

### 7.7 案例清單即時狀態

| 狀態圖示 | 說明 |
|----------|------|
| ⏳ 待執行 | 尚未輪到的案例 |
| ▶🔄 執行中 | 目前正在執行的案例（高亮顯示） |
| ✅ PASS | 測試通過 |
| ❌ FAIL | 測試失敗（點擊可展開查看失敗截圖與原因） |
| ⏭ SKIP | 被使用者跳過 |
| ⚠️ 已知問題 | 使用者手動標記的已知問題 |

點擊任一已完成的案例，可在內嵌瀏覽器區域回放該案例的截圖序列。

### 7.8 WebSocket 即時通訊協議

```jsonc
// Client → Server:
  { type: "start_test", payload: { executionId, targetUrl, ... } }
  { type: "pause" }
  { type: "resume" }
  { type: "skip_case" }
  { type: "stop_test" }
  { type: "retry_case", payload: { testCaseId } }

Server → Client:
  { type: "screenshot", payload: { base64Image, timestamp } }
  { type: "case_start", payload: { testCaseId, testCaseName, index, total } }
  { type: "step_update", payload: { testCaseId, stepIndex, stepTotal, description, status } }
  { type: "ai_thinking", payload: { testCaseId, message } }
  { type: "case_result", payload: { testCaseId, status, failScreenshot?, errorDetail? } }
  { type: "verification", payload: { testCaseId, checkpointIndex, description, passed } }
  { type: "log", payload: { timestamp, message, level } }
  { type: "test_complete", payload: { reportId, summary } }
  { type: "error", payload: { message, recoverable } }
```

### 7.9 截圖串流技術細節

| 項目 | 規格 |
|------|------|
| 串流方式 | WebSocket 傳輸 base64 JPEG |
| 畫面更新頻率 | 2-4 fps（操作時提高至 4 fps，靜止時降至 1 fps） |
| 截圖解析度 | 1280x720（可在設定中調整） |
| JPEG 品質 | 60%（平衡畫質與傳輸量） |
| 每幀大小 | 約 50-150 KB |
| 關鍵截圖保存 | 每個步驟完成時保存一張高品質截圖（品質 90%），供報告使用 |

### 7.10 測試限制

| 項目 | 限制 |
|------|------|
| 單一測試案例超時 | 60 秒 |
| 整體測試超時 | 30 分鐘 |
| 同時執行的測試數量 | 3 個（可在系統設定調整） |
| 目標網址 | 需為伺服器可存取的 URL |
| 瀏覽器視窗大小 | 預設 1280x720，可調整 |

### 7.11 錯誤處理

| 場景 | 處理方式 |
|------|----------|
| 目標網址無法連線 | 測試前做 health check，失敗則提示使用者 |
| 測試過程中網站無回應 | 記錄為「目標網站無回應」，跳過該案例繼續下一個 |
| AI API 呼叫失敗（429 限流） | 使用 key pool 輪替重試（參考 project-bridge 設計） |
| AI API 呼叫失敗（其他錯誤） | 最多重試 2 次，間隔 3 秒 |
| 瀏覽器崩潰 | 重啟瀏覽器實例，從失敗的案例繼續 |
| WebSocket 斷線 | 前端自動重連，後端繼續執行不中斷，重連後同步最新狀態 |
| AI 無法辨識頁面元素 | 標記該步驟為 fail，截圖保存，繼續下一步驟 |

---

## 8. 測試腳本格式規範（Agent-Agnostic）

```markdown
# 測試腳本：{專案名稱}

## 測試資訊
- 來源規格書：{檔案名稱列表}
- 產品：{產品名稱}
- 產生日期：{日期}
- 版本：{版本號}

## 全域前置條件
- {例如：需要登入帳號（角色：管理員）}
- {例如：測試資料需求}

## 測試案例

### TC-001: {測試案例名稱}
- **分類**：功能測試 | UI測試 | 邊界測試 | 安全性測試
- **優先級**：P0（必測） | P1（重要） | P2（一般）
- **前置步驟**：{若有特殊前置需求}
- **測試步驟**：
  1. 前往 {BASE_URL}/path
  2. 在「帳號」欄位輸入 test@example.com
  3. 點擊「登入」按鈕
  4. 等待頁面載入完成
- **預期結果**：頁面跳轉至首頁，顯示歡迎訊息
- **驗證點**：
  - [ ] URL 變為 {BASE_URL}/dashboard
  - [ ] 頁面包含文字「歡迎」
  - [ ] 無 console 錯誤

### TC-002: ...
```

**設計原則：**
- `{BASE_URL}` 佔位符，執行時替換為實際網址
- 步驟以自然語言描述，確保不同 AI Agent 皆可理解
- 驗證點使用 checkbox 格式，方便在報告中標記通過/未通過
- 分類與優先級支援選擇性執行

---

## 9. 功能模組五：測試報告

### 9.1 報告格式

```markdown
# 測試報告

## 摘要
- 專案名稱：{名稱}
- 測試日期：{日期時間}
- 目標網址：{URL}
- 使用腳本：{腳本名稱} v{版本}
- 測試結果：✅ 通過 {N} / ❌ 失敗 {N} / ⏭️ 跳過 {N}
- 通過率：{百分比}%
- 測試耗時：{時間}

## Bug 清單（待辦事項）

### [BUG-001] {Bug 標題}
- **嚴重度**：高 | 中 | 低
- **對應測試案例**：TC-{編號}
- **重現步驟**：
  1. ...
- **預期結果**：...
- **實際結果**：...
- **截圖**：{截圖連結}
- **建議修復方向**：{AI 分析的建議}

### [BUG-002] ...

## 測試案例詳細結果

### TC-001: {名稱} — ✅ PASS
- 執行時間：{秒}
- 備註：{若有}

### TC-002: {名稱} — ❌ FAIL（見 BUG-001）
- 執行時間：{秒}
- 失敗截圖：{截圖連結}
- 錯誤訊息：{若有 console error}
```

### 9.2 報告列表（專案內 Tab 3）
| 欄位 | 說明 |
|------|------|
| 測試日期 | 執行時間 |
| 目標網址 | 測試的 URL |
| 通過率 | 百分比 + 進度條 |
| Bug 數量 | 發現的 Bug 總數 |
| 操作 | 檢視 / 下載 .md |

### 9.3 全域測試記錄
獨立的「測試記錄」頁面，彙整所有測試（含從「系統測試」入口發起的）。
- 篩選：依產品、日期範圍、專案
- 排序：依日期

### 9.4 下載格式
- 第一版：`.md`
- 未來擴充：PDF、HTML

---

## 10. API Key Pool 管理

參考 project-bridge 的 `geminiKeys.ts` 設計，實作以下機制：

### 10.1 Key 儲存
- 支援從環境變數 `GEMINI_API_KEY` 載入（逗號分隔多個）
- 支援從資料庫 settings 表載入
- 去重 + 格式驗證（Gemini key 以 `AIza` 開頭，長度 39）

### 10.2 輪替策略
- Round-robin 輪替分配
- 記憶體快取，60 秒 TTL
- 支援即時失效重載

### 10.3 限流處理
- 偵測 429 / RESOURCE_EXHAUSTED 錯誤
- 自動排除失敗 key，隨機選擇其他可用 key
- 最多重試 2 次，間隔 3 秒

### 10.4 用量追蹤
- 記錄每次 API 呼叫的 token 使用量（prompt / completion / total）
- 按 key 後綴（末 4 碼）聚合統計
- 支援按日 / 週 / 月查看用量

### 10.5 管理介面
- 新增 key（驗證後加入 pool）
- 刪除 key（環境變數 key 只能封鎖，資料庫 key 可直接移除）
- 查看各 key 的用量統計

---

## 11. Slack 整合

### 11.1 通知事件
| 事件 | 通知內容 |
|------|----------|
| 測試完成 | 專案名稱、目標網址、通過率、Bug 數量、報告連結 |
| 測試失敗（系統錯誤） | 專案名稱、錯誤原因 |

### 11.2 設定
- 在系統設定中配置 Slack Webhook URL
- 可選擇要通知的頻道
- 可開關各事件的通知

---

## 12. 資料模型

### 12.1 核心 Entity（SQLite）

```sql
-- 使用者
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 產品（使用者可自行建立）
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code TEXT,                          -- 產品代碼（選填）
  description TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 測試專案
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'has_script' | 'testing' | 'completed'
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 規格書
CREATE TABLE specifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  original_files TEXT NOT NULL,          -- JSON array: [{name, path, size, type}]
  parsed_outline_md TEXT,                -- AI 整理後的規格大綱
  version INTEGER NOT NULL DEFAULT 1,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 測試腳本
CREATE TABLE test_scripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  specification_id INTEGER REFERENCES specifications(id),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content_md TEXT NOT NULL,              -- 測試腳本 Markdown 內容
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 測試執行
CREATE TABLE test_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id),
  test_script_id INTEGER REFERENCES test_scripts(id),
  target_url TEXT NOT NULL,
  test_account TEXT,                     -- 測試帳號（加密儲存）
  test_password TEXT,                    -- 測試密碼（加密儲存）
  execution_mode TEXT NOT NULL DEFAULT 'auto', -- 'auto' | 'step_by_step'
  browser_width INTEGER DEFAULT 1280,
  browser_height INTEGER DEFAULT 720,
  status TEXT NOT NULL DEFAULT 'queued', -- 'queued' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'
  progress INTEGER DEFAULT 0,           -- 0-100
  current_case_id TEXT,                  -- 目前正在執行的測試案例 ID
  started_at TEXT,
  completed_at TEXT,
  executed_by INTEGER REFERENCES users(id),
  source TEXT NOT NULL DEFAULT 'project', -- 'project' | 'system_test'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 測試結果（每個測試案例的結果）
CREATE TABLE test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
  test_case_id TEXT NOT NULL,            -- e.g. 'TC-001'
  test_case_name TEXT NOT NULL,
  status TEXT NOT NULL,                  -- 'pass' | 'fail' | 'skip' | 'known_issue'
  actual_result TEXT,
  screenshot_path TEXT,                  -- 最終結果截圖
  error_detail TEXT,
  execution_time_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 測試步驟 Log（逐步驟記錄，供回放與報告使用）
CREATE TABLE test_step_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
  test_case_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,           -- 步驟序號（從 1 開始）
  description TEXT NOT NULL,             -- 步驟描述（如「點擊登入按鈕」）
  ai_action TEXT,                        -- AI 回傳的操作指令 JSON
  ai_reasoning TEXT,                     -- AI 的判斷理由
  screenshot_path TEXT,                  -- 該步驟完成後的截圖
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'success' | 'fail'
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 測試報告
CREATE TABLE test_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
  report_md TEXT NOT NULL,               -- 完整報告 Markdown
  total_cases INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  pass_rate REAL NOT NULL DEFAULT 0,
  bug_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Bug 清單
CREATE TABLE bugs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES test_reports(id) ON DELETE CASCADE,
  bug_code TEXT NOT NULL,                -- e.g. 'BUG-001'
  title TEXT NOT NULL,
  severity TEXT NOT NULL,                -- 'high' | 'medium' | 'low'
  test_case_id TEXT,
  reproduce_steps TEXT,
  expected_result TEXT,
  actual_result TEXT,
  screenshot_path TEXT,
  suggestion TEXT,                       -- AI 建議的修復方向
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 系統設定
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- API Key 用量追蹤
CREATE TABLE api_key_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_suffix TEXT NOT NULL,
  model TEXT NOT NULL,
  call_type TEXT NOT NULL,               -- 'spec_parse' | 'script_generate' | 'test_execute' | 'report_generate'
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  project_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 操作紀錄
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,                  -- e.g. 'create_project', 'upload_spec', 'run_test'
  target_type TEXT,                      -- e.g. 'project', 'specification', 'test_execution'
  target_id INTEGER,
  detail TEXT,                           -- JSON 補充資訊
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 13. AI 整合規格

使用 Gemini 2.5 Flash，共有 4 個 AI 整合點：

### 13.1 規格書解析
- **輸入**：原始規格書純文字（多檔案合併）
- **輸出**：結構化規格大綱 Markdown
- **Prompt 目標**：提取功能需求、業務規則、UI 描述、資料流程

### 13.2 測試腳本產出
- **輸入**：確認後的規格大綱 + 產品類型
- **輸出**：符合第 8 節格式的測試腳本 Markdown
- **Prompt 目標**：涵蓋功能測試、UI 測試、邊界測試、錯誤處理測試

### 13.3 測試執行 Agent（內嵌瀏覽器驅動）
- **運作模式**：逐案例、逐步驟的 Loop — 每一步都是「截圖+DOM → AI 判斷 → 操作指令 → 執行 → 下一步」
- **輸入**（每步迴圈）：
  - 當前測試案例與步驟描述
  - 瀏覽器即時截圖（JPEG base64）
  - 頁面 DOM 結構（精簡版，移除 script/style）
  - 前一步的執行結果
- **輸出**（每步迴圈）：
  - 操作指令：`click(x, y)` / `type(selector, text)` / `navigate(url)` / `wait(ms)` / `scroll(direction)`
  - 步驟狀態判斷：成功/失敗/需重試
  - 驗證點判斷（在案例最後一步）：逐一判定 pass/fail + 原因說明
- **Prompt 目標**：準確解讀腳本步驟，根據截圖定位 UI 元素，正確操作瀏覽器，客觀判斷驗證點

### 13.4 測試報告產出
- **輸入**：所有測試案例的執行紀錄（步驟、截圖、判斷結果）
- **輸出**：符合第 9.1 節格式的測試報告 Markdown
- **Prompt 目標**：彙整結果、分類 Bug 嚴重度、提供修復建議

---

## 14. 系統架構建議

```text
┌─────────────────────────────────────────────────────────┐
│                      Frontend                            │
│                 (React / Next.js)                        │
│  ┌──────────┬──────────┬──────────────┬───────────┐     │
│  │ 專案管理  │ 規格書庫  │ 系統測試      │ 系統設定   │     │
│  └──────────┴──────────┴──────────────┴───────────┘     │
│  ┌────────────────────────────────────────────────┐     │
│  │ 內嵌瀏覽器元件 (LiveBrowserView)                │     │
│  │  ├─ WebSocket 截圖串流接收與渲染 (Canvas)       │     │
│  │  ├─ 測試案例清單（即時狀態更新）                  │     │
│  │  ├─ 步驟 Log 面板                              │     │
│  │  └─ 操作控制列（暫停/繼續/跳過/終止）            │     │
│  └────────────────────────────────────────────────┘     │
└────────────────────────┬────────────────────────────────┘
                         │ REST API + WebSocket (截圖串流 + 狀態推送)
┌────────────────────────┴────────────────────────────────┐
│                      Backend                             │
│               (Node.js / Fastify)                        │
│  ┌────────────────────────────────────────────────┐     │
│  │ Routes: projects / specs / tests / reports      │     │
│  │ WebSocket: /ws/test-session (即時截圖+控制指令)  │     │
│  ├────────────────────────────────────────────────┤     │
│  │ Services:                                       │     │
│  │  ├─ FileParser (docx/xls/csv → text)           │     │
│  │  ├─ GeminiKeyPool (輪替/限流/追蹤)              │     │
│  │  ├─ AIService (Gemini 2.5 Flash 整合)           │     │
│  │  ├─ TestOrchestrator (測試編排/逐案例調度)       │     │
│  │  │   ├─ 管理測試案例佇列與執行順序               │     │
│  │  │   ├─ 處理暫停/繼續/跳過/終止控制指令          │     │
│  │  │   └─ 協調 AI Agent ↔ Playwright 的互動迴圈   │     │
│  │  ├─ BrowserDriver (Playwright 瀏覽器控制)       │     │
│  │  │   ├─ 啟動/管理 Browser Context               │     │
│  │  │   ├─ 執行 AI 回傳的操作指令                   │     │
│  │  │   └─ 定時截圖 + DOM 擷取 → 串流推送           │     │
│  │  ├─ ReportGenerator (報告產出)                  │     │
│  │  └─ SlackNotifier (通知整合)                    │     │
│  ├────────────────────────────────────────────────┤     │
│  │ Database: SQLite (better-sqlite3)               │     │
│  │ File Storage: 本地檔案系統 (uploads/ screenshots/)│     │
│  └────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

---

## 15. 錯誤處理總覽

| 場景 | 處理方式 |
|------|----------|
| 上傳檔案為空或無法解析 | 顯示錯誤提示，不進入下一步 |
| 規格書內容太少 | 警告「內容不足以產生測試案例」，建議補充 |
| 規格書過大（超過 100 頁） | 分段處理，顯示進度 |
| 檔案格式損壞 | 提示「檔案無法解析，請重新上傳」 |
| 目標網址格式不正確 | 前端即時驗證 |
| 目標網址無法連線 | 測試前 health check，失敗則提示 |
| 測試中網站當機 | 記錄為「目標網站無回應」，不視為腳本錯誤 |
| AI API 限流 (429) | Key pool 輪替重試 |
| AI API 其他錯誤 | 重試 2 次後顯示錯誤 |

---

## 16. 開發階段建議

| 階段 | 範圍 | 交付物 |
|------|------|--------|
| **Phase 1 (MVP)** | 專案管理 + 規格書上傳 + AI 產出腳本 + 腳本編輯與下載 | 可用的腳本產出工具 |
| **Phase 2** | 測試執行（Playwright + Gemini Agent）+ 測試報告產出 | 完整的自動化測試功能 |
| **Phase 3** | 資料歸檔 + 系統測試獨立入口 + 測試記錄 | 完整的資料管理 |
| **Phase 4** | API Key Pool + Slack 整合 + 使用者管理 + 系統設定 | 完整的系統管理功能 |
