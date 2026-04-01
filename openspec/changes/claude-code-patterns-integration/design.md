## Context

Claude Code 洩漏的原始碼揭示三個 production AI agent 的核心模式：Skeptical Memory（記憶只是 hint）、Strict Write Discipline（寫入前驗證）、autoDream（閒置時記憶整合）。加上使用者要求的測試計畫版控。

## Goals / Non-Goals

**Goals:**
- 法官不盲信 skill，對照截圖驗證
- Skill 生成後自動驗證品質
- 測試完成後自動學習更新 skill
- 測試計畫保留版本歷史

**Non-Goals:**
- 不做閒置觸發的 dream（只在測試完成時）
- 不做 diff 視覺化
- 不做跨 project 學習

## Decisions

### D1: Skeptical Memory — 法官 prompt 改動

在 singleJudge 和 arbitrate 的 prompt 加入：
```
注意：以下領域知識僅供參考，不代表絕對正確。你必須：
1. 優先以截圖中實際觀察到的內容為準
2. 如果截圖顯示的行為與領域知識矛盾，以截圖為準並標注差異
3. 不要因為領域知識說「應該有 X」就判定沒有 X 是 bug — 要從截圖確認
```

**不需要改架構，只改 prompt 措辭。**

### D2: Strict Write Discipline — Skill 驗證

`generateFromSpec` 完成後，對每個生成的 skill 做一次輕量驗證：
1. 提取 skill content 中的 key facts（如 URL 範例 `/list/21_usage/`）
2. 在規格書原文中 grep 這些 facts
3. 如果 fact 在原文中找不到 → 標記 skill 為 `unverified`
4. 在前端顯示驗證狀態（✓ verified / ⚠ unverified）

**DB 加欄位：** `agent_skills.verified INTEGER DEFAULT 0`

### D3: autoDream — 測試完成後學習

在 `executeTests` 結束、報告產出後，非同步觸發 dream：

1. 讀取本次測試結果（passed/failed/errors）
2. 用 AI 分析失敗原因，分類為：
   - `selector_issue`: selector 找不到 → 更新 skill 加入「避免使用此 selector」
   - `url_format_issue`: URL 格式錯 → 更新 skill 的 URL 範例
   - `spec_mismatch`: 預期結果與規格書矛盾 → 更新 skill 修正規則
   - `real_bug`: 真正的 bug → 不動 skill
3. 對 `selector_issue` 和 `url_format_issue`，自動 append 到對應 skill 的 content 尾部
4. Log dream 結果

### D4: 測試計畫版控

**DB 新表：**
```sql
CREATE TABLE test_plan_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  test_plan JSON NOT NULL,
  components JSON,
  url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tpv_project ON test_plan_versions(project_id, version DESC);
```

- 每次 scan 完成，存入一筆版本記錄
- 前端可查看歷史版本、選擇回滾使用舊版測試計畫

## Risks / Trade-offs

- **autoDream 的 AI call 額外消耗 token** → 只在有 FAIL 時觸發，全 PASS 不觸發
- **Skill 驗證是 grep-based** → 簡單但可能有 false negative（原文用不同措辭描述同一規則）
- **版控會佔 DB 空間** → 每個版本只存 JSON，通常 < 10KB
