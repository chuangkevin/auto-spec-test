## Context

AI Agent 缺乏領域知識，只能靠截圖和 DOM 做淺層測試。project-bridge 已有成熟的 skill 系統（`agent_skills` 表 + SKILL.md 格式 + 批次匯入），本次移植其核心設計到 auto-spec-test，簡化不需要的功能（衝突檢測、依賴圖）。

## Goals / Non-Goals

**Goals:**
- 使用者能在系統設定批次匯入 SKILL.md 檔案
- Skill 內容自動注入 AI Agent 的討論和測試生成 prompt
- 支援 global scope（全域適用）
- Skill 啟用/停用/刪除管理

**Non-Goals:**
- 不做 project scope skill（簡化設計，先做 global）
- 不做 skill 衝突檢測
- 不做依賴圖視覺化
- 不做啟動時自動從檔案系統同步

## Decisions

### D1: DB Schema — 簡化版 agent_skills

**選擇：** 移植 project-bridge 的 `agent_skills` 表，移除 `project_id`、`depends_on`、`source_path` 欄位（初版不需要）。

```sql
CREATE TABLE agent_skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### D2: SKILL.md 格式 — 相容 project-bridge

```markdown
---
name: skill-name
description: 簡述
---

# Skill 內容（Markdown）
```

**理由：** 與 project-bridge 格式完全相容，方便跨專案共用 skill 檔案。

### D3: 批次匯入 API — upsert by name

**Endpoint:** `POST /api/skills/batch`

**行為：**
1. 接收 `{ skills: [{ name, description, content }] }` 陣列
2. name 存在 → 更新 description + content
3. name 不存在 → 新增
4. 回傳 `{ imported: N, updated: M }`

**理由：** 冪等操作，重複匯入安全。

### D4: Skill 注入位置 — 討論 + 掃描

**注入 1：`testOrchestrator.discuss()`**
- 在 Echo/Lisa/Bob 的 prompt 加入啟用中的 skill 內容
- 格式：`=== 領域知識 ===\n### skill-name\n content \n===`
- 限制最多 5 個 skill（控制 token）

**注入 2：`pageScannerService.scanPage()` 的 specContent**
- 已有的 `enrichedSpec` 機制可直接附加 skill 內容
- 在 testRunner.ts scan 流程中，取出啟用的 skill 加到 enrichedSpec

### D5: 前端 UI — 系統設定新 tab

**位置：** 現有的系統設定頁面（/settings）新增「AI Skills」tab

**功能：**
- Skill 列表：名稱、描述、啟用狀態 toggle
- 批次匯入：拖拉 SKILL.md 檔案 → 解析預覽 → 確認匯入
- 編輯：點擊 skill 展開編輯 name/description/content
- 刪除：單個刪除 + 批次刪除

## Risks / Trade-offs

- **Token 用量增加** → 限制最多注入 5 個 skill，每個 content 截斷至 2000 字
- **Global only** → 初版不分專案，所有測試都會注入相同 skill。後續可加 project scope
- **無衝突檢測** → 不檢查 skill 規則與測試計畫的矛盾，依賴 AI 自行判斷
