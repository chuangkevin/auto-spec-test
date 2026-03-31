## ADDED Requirements

### Requirement: 測試案例以使用者旅程為核心
系統 SHALL 產出以使用者操作流程為核心的測試案例，而非逐元件的存在性驗證。每個測試案例 SHALL 代表一個完整的使用者意圖（如「登入後進入 dashboard」），包含 2-5 個連續操作步驟。

#### Scenario: 登入頁面產出流程測試
- **WHEN** AI 掃描一個包含帳號輸入、密碼輸入、登入按鈕的登入頁面
- **THEN** 產出的測試案例 SHALL 包含「填入帳號→填入密碼→點擊登入→驗證跳轉結果」的完整流程，而非分別驗證「帳號輸入框存在」「密碼輸入框存在」「登入按鈕存在」

#### Scenario: 無需驗證元件存在性
- **WHEN** AI 產出測試計畫
- **THEN** SHALL NOT 包含任何純元件存在性驗證（如「驗證按鈕可見」「驗證標題文字」），除非該驗證是流程步驟的一部分

### Requirement: 測試案例數量精簡
系統 SHALL 產出 6-10 個高品質測試案例，取代原本 12-18 個淺層測試。每個案例 SHALL 至少包含一個有業務意義的驗證點。

#### Scenario: 簡單頁面產出精簡測試
- **WHEN** AI 掃描一個只有登入表單的頁面
- **THEN** 產出 3-5 個測試案例：正常登入、空帳號、錯誤密碼、特殊字元輸入等

#### Scenario: 複雜頁面產出完整測試
- **WHEN** AI 掃描一個包含導航、表單、列表、篩選器的複雜頁面
- **THEN** 產出 8-10 個測試案例，涵蓋核心功能的 happy path 和 edge case

### Requirement: 語意型 selector 策略
系統 SHALL 使用穩定的語意型 selector，禁止位置型和混合型 selector。

#### Scenario: selector 優先順序
- **WHEN** AI 為測試步驟選擇 selector
- **THEN** SHALL 按以下優先順序使用：(1) #id (2) [data-testid="XXX"] (3) [placeholder="XXX"] (4) [aria-label="XXX"] (5) role=XXX[name="YYY"] (6) text="XXX"（精確匹配，帶引號）

#### Scenario: 禁止位置型 selector
- **WHEN** AI 產出測試步驟
- **THEN** SHALL NOT 使用 `nth-of-type`、`nth-child`、`div > div > button` 等位置型 selector

#### Scenario: 禁止混合型 selector
- **WHEN** AI 產出測試步驟
- **THEN** SHALL NOT 使用 `button text="XXX"` 或 `a text="XXX"` 等 tag+text 混合格式（Playwright 不支援）。正確寫法為 `text="XXX"` 或使用元件列表中的 selector

#### Scenario: 禁止裸 placeholder selector
- **WHEN** AI 需要定位輸入框
- **THEN** SHALL 使用 `[placeholder="XXX"]`（帶方括號和引號），SHALL NOT 使用 `placeholder=XXX`（語法錯誤）

#### Scenario: text selector 歧義處理
- **WHEN** `text="XXX"` 可能匹配到隱藏元素（如下拉選單內的連結）
- **THEN** 系統 SHALL 自動加上 `>> visible=true` 修飾符，只匹配可見元素

#### Scenario: Selector 自動修正
- **WHEN** AI 產出了格式錯誤的 selector（如 `placeholder=XXX`、`a text="XXX"`）
- **THEN** executeStep SHALL 自動修正為合法格式再執行，不直接報錯

#### Scenario: 無可用 selector 則跳過
- **WHEN** 某功能在 DOM 中找不到穩定的語意型 selector
- **THEN** SHALL 不產出該測試步驟，而非使用脆弱的 selector

### Requirement: 分頁與篩選器測試策略
系統 SHALL 教導 AI 使用 URL 參數方式測試分頁和篩選功能，不依賴脆弱的 DOM selector。

#### Scenario: 分頁測試用 URL 參數
- **WHEN** 頁面有分頁功能（URL 含 ?p= 或 ?page= 參數）
- **THEN** 測試案例 SHALL 使用 navigate 動作直接改 URL 參數（如 ?p=2）來測試分頁，不依賴分頁按鈕的 selector

#### Scenario: 篩選器無穩定 selector 時用 URL
- **WHEN** 篩選器元件找不到穩定的語意 selector
- **THEN** 測試案例 SHALL 使用 navigate 動作改 URL 參數來測試篩選功能

### Requirement: 討論結果影響測試生成
AI 討論 Agent（Echo/Lisa/Bob）的建議 SHALL 被格式化為結構化上下文，注入 scanPage prompt，直接影響測試案例的生成方向。

#### Scenario: 討論建議被納入掃描
- **WHEN** 討論 Agent 指出「需要特別測試權限控制」
- **THEN** scanPage prompt SHALL 包含該建議，產出的測試案例 SHALL 涵蓋權限相關流程

### Requirement: 頁面狀態感知
AI SHALL 根據當前頁面狀態（URL、已登入使用者、頁面內容）產出合理的測試案例，不產出與當前狀態矛盾的測試。

#### Scenario: 已登入狀態不測未登入重導
- **WHEN** 頁面截圖顯示使用者已登入（如顯示使用者名稱、dashboard 內容）
- **THEN** SHALL NOT 產出「未登入使用者被重導至登入頁」的測試案例

### Requirement: 多頁面深度探索（超廣無邊際瀏覽）
系統 SHALL 在掃描階段自動跟隨頁面中的重要連結，探索 2-3 層深的子頁面，建立整站頁面地圖（Site Map），再根據地圖產出跨頁面的流程測試。

#### Scenario: 自動探索子頁面
- **WHEN** AI 探索一個包含導航列、列表頁連結、篩選器的頁面
- **THEN** SHALL 自動跟隨主要導航連結和列表項連結，探索至少 3-5 個子頁面，記錄每個頁面的 URL、標題、核心元件

#### Scenario: 建立整站頁面地圖
- **WHEN** 深度探索完成
- **THEN** SHALL 產出結構化的頁面地圖 JSON，包含：每個已探索頁面的 URL、標題、頁面類型（列表/詳情/表單/設定）、核心可互動元件摘要

#### Scenario: 跨頁面流程測試
- **WHEN** AI 根據頁面地圖產出測試案例
- **THEN** 測試案例 SHALL 包含跨頁面的使用者旅程（如「從列表頁點擊物件→進入詳情頁→驗證資訊正確→返回列表」），而非僅測試單一頁面

#### Scenario: 深頁面評判上下文
- **WHEN** 測試步驟導航到了與初始掃描不同的頁面
- **THEN** 評判 AI SHALL 重新分析當前頁面的 URL、標題、DOM 內容，而非用初始掃描的頁面理解來判斷

#### Scenario: 探索深度與廣度限制
- **WHEN** AI 進行深度探索
- **THEN** SHALL 限制最大探索深度為 3 層、最大頁面數為 10 個、每頁停留不超過 10 秒，避免無限遞迴或效能問題

#### Scenario: 自動登入恢復
- **WHEN** 深度探索或測試執行過程中遇到登入頁面
- **THEN** SHALL 自動嘗試恢復登入（還原 session → 點擊帳號 → 降級為手動介入），不因登入中斷而放棄後續測試
