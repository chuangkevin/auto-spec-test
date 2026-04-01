## Context

目前 AI 測試流程的知識注入有三個問題：
1. 規格書 12000+ 字全灌 → prompt 太長、AI 忽略關鍵規則
2. Global skill 20 個跟目標頁面無關 → AI 篩選回傳空或選錯
3. 沒有 project-specific 知識層 → 每次測試都從零理解規格書

Claude Code 的三層記憶架構啟發了解法：規格書只讀一次，提取精煉知識存為 project skill（L1），測試時直接注入。

## Goals / Non-Goals

**Goals:**
- 規格書解析後自動生成 3-5 個 project skill
- 每個 skill 200-500 字，涵蓋一個具體業務規則
- 測試時優先載入 project skill，不需要 AI 篩選
- 前端可查看和編輯生成的 skill

**Non-Goals:**
- 不做 skill 品質自動評估
- 不做測試後 skill 自動更新
- 不做 project skill 與 global skill 的衝突檢測

## Decisions

### D1: DB — agent_skills 加 project_id

```sql
ALTER TABLE agent_skills ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;
CREATE INDEX idx_agent_skills_project ON agent_skills(project_id);
```

- `project_id = NULL` → global skill（現有行為不變）
- `project_id = N` → 只在該 project 測試時注入

### D2: 規格書 → skill 提取 prompt

一次 AI call，輸入 `parsed_outline_md`，要求提取：

```
你是一個 QA 知識萃取專家。以下是一個產品的規格書大綱。
請從中提取 3-5 個最重要的業務規則，每個規則包含：

1. name: kebab-case 識別名（如 url-format-rules）
2. description: 一行描述（50 字內）
3. content: 精煉的規則內容（200-500 字），包含具體的格式、參數、邏輯

提取重點：
- URL 結構和參數格式（這對自動化測試最重要）
- 篩選/搜尋條件的交互邏輯
- 頁面狀態切換的行為規則
- 資料顯示/排序的業務邏輯
- 邊界條件和特殊情況

回傳 JSON: { "skills": [{ "name": "...", "description": "...", "content": "..." }] }
```

**選擇理由：** 一次 call 提取多個 skill，比多次 call 省 token。用 JSON 格式確保結構化。

### D3: 測試時的 skill 載入順序

```
1. getProjectSkills(projectId) → 有就全用（通常 3-5 個，不需要篩選）
2. 如果沒有 project skill → 走 selectRelevant() 篩選 global skill
3. 如果都沒有 → 走 enrichedSpec（直接灌規格書原文，現有 fallback）
```

**選擇理由：** Project skill 是最精準的知識，不需要 AI 篩選。只有沒有 project skill 時才 fallback 到 global。

### D4: 觸發時機 — 規格書解析完成後

在 `POST /api/projects/:projectId/specifications/:specId/parse` 成功後，非同步觸發 skill 生成。不阻斷解析流程。

### D5: 前端 — 專案頁面 skill 區塊

在專案「測試腳本」tab 下方加一個「AI 知識萃取」區塊：
- 顯示已生成的 project skill 列表
- 可展開編輯
- 「重新生成」按鈕

## Risks / Trade-offs

- **AI 提取品質不穩定** → 使用者可以手動編輯修正
- **規格書太短可能提取不出有用 skill** → 少於 500 字不觸發自動生成
- **額外一次 AI call** → 只在解析時跑一次，後續測試不再需要
