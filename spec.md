# Auto Spec Test - 自動化規格測試工具 完整規格書

## 1. 產品概述

### 1.1 產品定位
協助 PM、QA 人員進行系統測試的自動化工具。支援兩種測試模式：

1. **規格驅動測試**：上傳規格書，AI 產出測試腳本後執行
2. **URL 探索測試**：直接貼上網址，AI 自動掃描頁面元件、規劃測試流程並執行

兩種模式皆透過內嵌瀏覽器即時視覺化呈現，使用者可全程觀看 AI 操作過程，並隨時介入控制。

### 1.2 目標使用者

- PM（產品經理）：上傳規格書、檢視測試報告
- QA（測試人員）：編輯測試腳本、執行測試、即時監控與介入、分析報告
- 開發團隊負責人：檢視測試報告、追蹤 Bug

### 1.3 核心價值

- **兩種測試模式**：有規格走規格驗證，無規格走智慧探索
- 內嵌瀏覽器即時視覺化測試，使用者可全程觀看
- AI 自動辨識頁面元件並規劃測試流程
- 測試過程完全可控：勾選/排序/新增/暫停介入/跳過
- 自動產出測試報告與 Bug 清單

### 1.4 技術決策摘要

| 項目 | 決策 |
| ---- | ---- |
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
| ---- | ---- | ---- |
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
│       ├── Tab 2: 進行測試（內嵌瀏覽器即時視覺化測試 → 逐案例執行）
│       └── Tab 3: 測試報告（歷次報告列表 → 報告詳情）
├── URL 快速測試（貼網址 → AI 掃描元件 → 任務清單 → 即時執行 → 報告）
├── 規格書庫（資料歸檔，依產品分類）
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
| ---- | ---- | ---- | ---- |
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
| ---- | ---- |
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
| ---- | ---- |
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

系統內嵌瀏覽器畫面，AI Agent 逐條執行測試案例，使用者可即時觀看操作過程。支援兩種來源：

- **從專案發起**：使用已產出的測試腳本
- **從 URL 快速測試發起**：AI 自動掃描頁面產出的任務清單

技術方案：後端 Playwright 操作瀏覽器，透過 WebSocket 即時串流截圖到前端（約 2-4 fps）。

### 7.2 測試執行頁面佈局

```
┌─────────────────────────────────────────────────────────────┐
│  測試設定列：[目標網址 ___________] [測試帳號] [測試密碼]       │
│             [執行模式: ◉自動 ○逐步] [▶ 開始測試]              │
├────────────────────────────────┬────────────────────────────┤
│                                │  測試任務清單               │
│     內嵌瀏覽器畫面              │  ☑ TC-001 登入功能   ✅     │
│     (WebSocket 截圖串流)        │  ☑ TC-002 首頁顯示   ▶🔄   │
│                                │  ☑ TC-003 搜尋功能   ⏳     │
│     ┌────────────────────┐    │  ☐ TC-004 進階篩選   ⏳     │
│     │   目標網站即時畫面   │    │  ☑ TC-005 表單送出   ⏳     │
│     │                    │    │                            │
│     └────────────────────┘    │  [↑↓ 調整順序] [+ 新增案例]  │
│                                │                            │
│                                │  目前執行步驟               │
│                                │  步驟 2/4: 在「帳號」        │
│                                │  欄位輸入 test@mail.com     │
│                                │  AI 判斷：欄位已找到...      │
├────────────────────────────────┴────────────────────────────┤
│  操作列：[⏸ 暫停] [▶ 繼續] [✋ 手動介入] [⏭ 跳過] [⏹ 終止]  │
│  即時 Log                                                    │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 發起測試設定

**從專案內發起：**

| 欄位 | 類型 | 必填 | 說明 |
| ---- | ---- | ---- | ---- |
| 目標網址 | URL input | 是 | 驗證 URL 格式，測試前做連線檢查 |
| 測試帳號 | text | 否 | 目標網站的登入帳號 |
| 測試密碼 | password | 否 | 目標網站的登入密碼 |
| 執行範圍 | checkbox group | 否 | 可勾選/取消勾選要執行的測試案例，預設全部勾選 |
| 執行順序 | drag & drop | 否 | 可拖曳調整測試案例的執行順序 |
| 執行模式 | radio | 否 | 自動模式（預設）/ 逐步模式（每案例完成後暫停等待確認） |

### 7.4 任務清單互動

使用者在測試前及測試過程中可進行以下操作：

**測試前：**

- 勾選/取消勾選：決定哪些測試案例要執行
- 拖曳排序：調整測試案例的執行順序
- 新增案例：手動輸入測試案例名稱、步驟、預期結果
- 編輯案例：修改現有案例的步驟或預期結果
- 刪除案例：移除不需要的案例（僅限手動新增的）

**測試中：**

- 勾選/取消勾選待執行案例：即時調整後續要測試的範圍
- 新增案例：測試過程中發現新的測試情境，即時新增到清單尾端
- 調整待執行案例順序：已執行的案例順序鎖定，僅待執行的可調整

### 7.5 手動介入模式

當使用者點擊「手動介入」或系統處於暫停狀態時：

1. AI 暫停操作，瀏覽器保持當前狀態
2. 前端切換為「手動操作提示」
3. 使用者在目標網站上手動操作（例如：處理驗證碼、登入第三方帳號等 AI 無法處理的步驟）
4. 使用者完成手動操作後，點擊「繼續」，AI 從當前頁面狀態繼續執行

**手動介入場景：**

- AI 無法處理的操作（如：圖形驗證碼、兩步驟驗證）
- 使用者想手動設定特定資料或狀態
- 使用者想觀察特定頁面後再繼續

### 7.6 即時互動控制

| 操作 | 說明 |
| ---- | ---- |
| 暫停 | 暫停測試，瀏覽器保持當前狀態 |
| 繼續 | 從暫停處繼續 |
| 手動介入 | 暫停 AI，使用者手動操作瀏覽器，完成後繼續 |
| 跳過此案例 | 標記為 skip，進入下一個 |
| 終止測試 | 結束測試，已完成案例仍產出報告 |
| 重測此案例 | 對失敗案例重新執行 |
| 標記已知問題 | 手動標記，不列入 Bug 清單 |

### 7.7 案例即時狀態（燈號）

| 狀態 | 燈號 | 說明 |
| ---- | ---- | ---- |
| 待執行 | 灰燈 | 尚未輪到 |
| 執行中 | 黃燈 | 目前正在執行（高亮動畫） |
| 通過 | 綠燈 | 測試通過 |
| 失敗 | 紅燈 | 測試失敗（點擊可查看截圖與原因） |
| 跳過 | 灰燈 | 被使用者跳過 |
| 已知問題 | 橙燈 | 手動標記的已知問題 |

### 7.8 測試限制

| 項目 | 限制 |
| ---- | ---- |
| 單一案例超時 | 60 秒 |
| 整體測試超時 | 30 分鐘 |
| 同時執行數量 | 3 個（可調整） |
| 瀏覽器視窗 | 預設 1280x720 |

### 7.9 錯誤處理

| 場景 | 處理方式 |
| ---- | ---- |
| 目標網址無法連線 | 測試前做 health check，失敗則提示使用者 |
| 測試過程中網站無回應 | 記錄為「目標網站無回應」，跳過該案例繼續下一個 |
| AI API 呼叫失敗（429 限流） | 使用 key pool 輪替重試 |
| AI API 呼叫失敗（其他錯誤） | 最多重試 2 次，間隔 3 秒 |
| 瀏覽器崩潰 | 重啟瀏覽器實例，從失敗的案例繼續 |
| 手動介入逾時 | 暫停 5 分鐘無操作，提示使用者是否繼續或終止 |

---

## 7b. 功能模組：URL 快速測試（智慧探索模式）

### 7b.1 設計概念

使用者只需貼上一個網址，系統透過內嵌瀏覽器載入頁面，AI 自動掃描並辨識頁面上的可測試元件，規劃測試流程，產出任務清單。使用者確認後即可開始逐條視覺化測試。

**核心流程：**

```
貼上網址 → 內嵌瀏覽器載入 → AI 掃描元件 → 產出任務清單 → 使用者調整 → 逐條執行 → 報告
```

### 7b.2 頁面流程

**Phase 1：輸入網址 & 掃描**

```
┌─────────────────────────────────────────────────────────────┐
│  [請輸入目標網址 ________________________] [開始掃描]         │
│  [測試帳號（選填）______] [測試密碼（選填）______]              │
│  [附加規格書（選填）：拖拉上傳 .md .docx .xlsx .csv]          │
├────────────────────────────────┬────────────────────────────┤
│                                │                            │
│     內嵌瀏覽器畫面              │  AI 掃描中...               │
│                                │                            │
│     ┌────────────────────┐    │  發現的元件：               │
│     │                    │    │  ┌─ 登入表單 ─────────┐    │
│     │   [AI 正在掃描頁面]  │    │  │ 帳號輸入框 (input)  │    │
│     │   [元件高亮標記中]   │    │  │ 密碼輸入框 (input)  │    │
│     │                    │    │  │ 登入按鈕 (button)   │    │
│     └────────────────────┘    │  └────────────────────┘    │
│                                │  ┌─ 導覽列 ──────────┐    │
│                                │  │ 首頁 (link)        │    │
│                                │  │ 關於我們 (link)     │    │
│                                │  └────────────────────┘    │
└────────────────────────────────┴────────────────────────────┘
```

**Phase 2：任務清單確認**

- 使用者可勾選/取消勾選、拖曳排序、新增/編輯/刪除案例
- 點擊案例可展開查看/編輯步驟與預期結果
- 確認後點擊「開始測試」

**Phase 3：執行測試**

- 與第 7 節的測試執行流程相同（內嵌瀏覽器、燈號、手動介入等）

**Phase 4：測試完成**

- 顯示測試結果摘要（綠燈/紅燈清單）
- 可檢視完整報告、下載報告、存為專案、重新測試

### 7b.3 AI 元件掃描流程

1. Playwright 載入目標網址
2. 等待頁面載入完成（networkidle）
3. 擷取頁面截圖 + 完整 DOM 結構
4. 送至 Gemini 2.5 Flash 進行分析：
   - 辨識頁面上所有可互動元件（input、button、select、link、form 等）
   - 分類元件功能（登入表單、搜尋列、導覽選單、資料表格等）
   - 若有附加規格書，對照規格補充測試案例
5. AI 根據發現的元件規劃測試案例（正向/負向/邊界/UI）
6. 回傳結構化的任務清單

### 7b.4 掃描結果與規格書的結合

| 情境 | 行為 |
| ---- | ---- |
| 無規格書 | AI 純粹根據頁面元件規劃測試（智慧探索） |
| 有規格書 | AI 先解析規格書，再對照頁面元件，產出更完整的測試案例 |
| 規格書有但頁面缺少對應元件 | 標記為「規格要求但頁面未實作」，列為 Bug 候選 |
| 頁面有但規格書未提及的元件 | 仍產出基本測試案例，標記為「額外發現」 |

### 7b.5 存為專案

URL 快速測試完成後，使用者可選擇「存為專案」：

1. 輸入專案名稱、選擇產品
2. 系統自動將 AI 產出的任務清單轉換為標準測試腳本格式
3. 測試報告自動關聯到新專案
4. 後續可在專案中重複執行測試

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
- 測試結果：通過 {N} / 失敗 {N} / 跳過 {N}
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

### TC-001: {名稱} — PASS
- 執行時間：{秒}
- 備註：{若有}

### TC-002: {名稱} — FAIL（見 BUG-001）
- 執行時間：{秒}
- 失敗截圖：{截圖連結}
- 錯誤訊息：{若有 console error}
```

### 9.2 報告列表（專案內 Tab 3）

| 欄位 | 說明 |
| ---- | ---- |
| 測試日期 | 執行時間 |
| 目標網址 | 測試的 URL |
| 通過率 | 百分比 + 進度條 |
| Bug 數量 | 發現的 Bug 總數 |
| 操作 | 檢視 / 下載 .md |

### 9.3 全域測試記錄

獨立的「測試記錄」頁面，彙整所有測試（含從「URL 快速測試」入口發起的）。

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
| ---- | ---- |
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
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 產品（使用者可自行建立）
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code TEXT,
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
  status TEXT NOT NULL DEFAULT 'draft',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 規格書
CREATE TABLE specifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  original_files TEXT NOT NULL,
  parsed_outline_md TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 測試腳本
CREATE TABLE test_scripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  specification_id INTEGER REFERENCES specifications(id),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content_md TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 測試執行
CREATE TABLE test_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id),
  test_script_id INTEGER REFERENCES test_scripts(id),
  target_url TEXT NOT NULL,
  test_account TEXT,
  test_password TEXT,
  execution_mode TEXT NOT NULL DEFAULT 'auto',
  browser_width INTEGER DEFAULT 1280,
  browser_height INTEGER DEFAULT 720,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER DEFAULT 0,
  current_case_id TEXT,
  selected_cases TEXT,
  case_order TEXT,
  started_at TEXT,
  completed_at TEXT,
  executed_by INTEGER REFERENCES users(id),
  source TEXT NOT NULL DEFAULT 'project',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 測試結果（每個測試案例）
CREATE TABLE test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
  test_case_id TEXT NOT NULL,
  test_case_name TEXT NOT NULL,
  status TEXT NOT NULL,
  actual_result TEXT,
  screenshot_path TEXT,
  error_detail TEXT,
  execution_time_ms INTEGER,
  sort_order INTEGER,
  is_manual_added INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 測試步驟 Log
CREATE TABLE test_step_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
  test_case_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  description TEXT NOT NULL,
  ai_action TEXT,
  ai_reasoning TEXT,
  screenshot_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  is_manual INTEGER DEFAULT 0,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 頁面掃描結果（URL 快速測試用）
CREATE TABLE page_scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER REFERENCES test_executions(id) ON DELETE CASCADE,
  target_url TEXT NOT NULL,
  screenshot_path TEXT,
  dom_snapshot TEXT,
  components_json TEXT,
  generated_cases_json TEXT,
  spec_files TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 測試報告
CREATE TABLE test_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
  report_md TEXT NOT NULL,
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
  bug_code TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  test_case_id TEXT,
  reproduce_steps TEXT,
  expected_result TEXT,
  actual_result TEXT,
  screenshot_path TEXT,
  suggestion TEXT,
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
  call_type TEXT NOT NULL,
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
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 13. AI 整合規格

使用 Gemini 2.5 Flash，共有 5 個 AI 整合點：

### 13.1 規格書解析

- **輸入**：原始規格書純文字（多檔案合併）
- **輸出**：結構化規格大綱 Markdown
- **Prompt 目標**：提取功能需求、業務規則、UI 描述、資料流程

### 13.2 測試腳本產出

- **輸入**：確認後的規格大綱 + 產品類型
- **輸出**：符合第 8 節格式的測試腳本 Markdown
- **Prompt 目標**：涵蓋功能測試、UI 測試、邊界測試、錯誤處理測試

### 13.3 頁面元件掃描（URL 快速測試用）

- **輸入**：頁面截圖 + DOM 結構 + 規格書（若有附加）
- **輸出**：結構化的元件清單 + 測試任務清單（JSON）
- **Prompt 目標**：辨識所有可互動 UI 元件、產出正向/負向/邊界/UI 測試、對照規格標記差異

### 13.4 測試執行 Agent（內嵌瀏覽器驅動）

- **運作模式**：逐案例、逐步驟的 Loop — 截圖+DOM → AI 判斷 → 操作指令 → 執行 → 下一步
- **輸入**（每步迴圈）：當前測試案例與步驟描述 + 瀏覽器截圖 + DOM 結構 + 前一步結果
- **輸出**（每步迴圈）：操作指令 + 步驟狀態判斷 + 驗證點判斷
- **Prompt 目標**：準確解讀腳本步驟，根據截圖定位 UI 元素，正確操作瀏覽器，客觀判斷驗證點

### 13.5 測試報告產出

- **輸入**：所有測試案例的執行紀錄（步驟、截圖、判斷結果）
- **輸出**：符合第 9.1 節格式的測試報告 Markdown
- **Prompt 目標**：彙整結果、分類 Bug 嚴重度、提供修復建議

---

## 14. 系統架構建議

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│                   (React / Next.js)                          │
│  ┌──────────┬──────────┬────────────────┬───────────┐       │
│  │ 專案管理  │ 規格書庫  │ URL 快速測試   │ 系統設定   │       │
│  └──────────┴──────────┴────────────────┴───────────┘       │
│  ┌──────────────────────────────────────────────────┐       │
│  │ 內嵌瀏覽器元件 (LiveBrowserView)                  │       │
│  │  ├─ WebSocket 截圖串流接收與渲染 (Canvas)         │       │
│  │  ├─ 測試任務清單（勾選/排序/新增/即時狀態燈號）     │       │
│  │  ├─ 步驟 Log 面板                                │       │
│  │  └─ 操作控制列（暫停/繼續/手動介入/跳過/終止）     │       │
│  └──────────────────────────────────────────────────┘       │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API + WebSocket
┌──────────────────────────┴──────────────────────────────────┐
│                        Backend                               │
│                 (Node.js / Fastify)                          │
│  ┌──────────────────────────────────────────────────┐       │
│  │ Routes: projects / specs / tests / reports        │       │
│  │ WebSocket: /ws/test-session                       │       │
│  ├──────────────────────────────────────────────────┤       │
│  │ Services:                                         │       │
│  │  ├─ FileParser (docx/xls/csv → text)             │       │
│  │  ├─ GeminiKeyPool (輪替/限流/追蹤)                │       │
│  │  ├─ AIService (Gemini 2.5 Flash 整合)             │       │
│  │  ├─ PageScanner (URL 快速測試：元件掃描+任務規劃)  │       │
│  │  ├─ TestOrchestrator (測試編排/逐案例調度/手動介入) │       │
│  │  ├─ BrowserDriver (Playwright 瀏覽器控制)         │       │
│  │  ├─ ReportGenerator (報告產出)                    │       │
│  │  └─ SlackNotifier (通知整合)                      │       │
│  ├──────────────────────────────────────────────────┤       │
│  │ Database: SQLite (better-sqlite3)                 │       │
│  │ File Storage: 本地檔案系統 (uploads/ screenshots/) │       │
│  └──────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

---

## 15. 錯誤處理總覽

| 場景 | 處理方式 |
| ---- | ---- |
| 上傳檔案為空或無法解析 | 顯示錯誤提示，不進入下一步 |
| 規格書內容太少 | 警告「內容不足以產生測試案例」，建議補充 |
| 規格書過大（超過 100 頁） | 分段處理，顯示進度 |
| 檔案格式損壞 | 提示「檔案無法解析，請重新上傳」 |
| 目標網址格式不正確 | 前端即時驗證 |
| 目標網址無法連線 | 測試前 health check，失敗則提示 |
| 頁面掃描無法辨識元件 | 提示「頁面內容不足以產生測試案例」，建議附加規格書或手動新增 |
| 頁面需要登入才能掃描 | 提示使用者填寫測試帳密，或進入手動介入模式先完成登入 |
| 測試中網站當機 | 記錄為「目標網站無回應」，不視為腳本錯誤 |
| AI API 限流 (429) | Key pool 輪替重試 |
| AI API 其他錯誤 | 重試 2 次後顯示錯誤 |
| WebSocket 斷線 | 前端自動重連，後端繼續執行不中斷 |
| AI 無法辨識頁面元素 | 標記該步驟為 fail，截圖保存，繼續下一步驟 |
| 手動介入逾時 | 暫停 5 分鐘無操作，提示使用者是否繼續或終止 |

---

## 16. 開發階段建議

| 階段 | 範圍 | 交付物 |
| ---- | ---- | ---- |
| **Phase 1 (MVP)** | 專案管理 + 規格書上傳 + AI 產出腳本 + 腳本編輯與下載 | 可用的腳本產出工具 |
| **Phase 2** | 測試執行（Playwright + Gemini Agent + 內嵌瀏覽器 + 任務清單互動 + 手動介入）+ 測試報告 | 完整的可視化自動測試功能 |
| **Phase 3** | URL 快速測試（元件掃描 + 智慧探索）+ 資料歸檔 + 測試記錄 | 無需規格書也能測試 + 完整資料管理 |
| **Phase 4** | API Key Pool + Slack 整合 + 使用者管理 + 系統設定 | 完整的系統管理功能 |

---

## 17. WebSocket 協議規格

```jsonc
// Client → Server:
{ "type": "start_test", "payload": { "executionId": "...", "targetUrl": "...", "selectedCases": ["TC-001", "TC-003"], "caseOrder": ["TC-003", "TC-001"] } }
{ "type": "pause" }
{ "type": "resume" }
{ "type": "manual_takeover" }
{ "type": "manual_done" }
{ "type": "skip_case" }
{ "type": "stop_test" }
{ "type": "retry_case", "payload": { "testCaseId": "TC-001" } }
{ "type": "add_case", "payload": { "name": "...", "steps": [...], "expected": "..." } }
{ "type": "update_case_order", "payload": { "caseOrder": ["TC-002", "TC-001", "TC-003"] } }
{ "type": "toggle_case", "payload": { "testCaseId": "TC-004", "enabled": false } }

// Server → Client:
{ "type": "screenshot", "payload": { "base64Image": "...", "timestamp": 1234 } }
{ "type": "case_start", "payload": { "testCaseId": "TC-001", "index": 1, "total": 10 } }
{ "type": "step_update", "payload": { "testCaseId": "TC-001", "stepIndex": 2, "description": "..." } }
{ "type": "case_result", "payload": { "testCaseId": "TC-001", "status": "pass" } }
{ "type": "manual_mode_active", "payload": { "message": "AI 已暫停，請手動操作瀏覽器" } }
{ "type": "test_complete", "payload": { "reportId": 1, "summary": {} } }
{ "type": "task_list_updated", "payload": { "cases": [...] } }
```

### 截圖串流規格

| 項目 | 規格 |
| ---- | ---- |
| 串流方式 | WebSocket base64 JPEG |
| 更新頻率 | 2-4 fps（操作時 4 fps，靜止時 1 fps） |
| 解析度 | 1280x720 |
| JPEG 品質 | 60%（串流）/ 90%（關鍵截圖保存） |
| 每幀大小 | 約 50-150 KB |
