import { randomUUID } from 'node:crypto';
import { getDb } from '../db/connection.js';
import { getGeminiApiKey, getGeminiModel, trackUsage } from './geminiKeys.js';

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: number;
  order_index: number;
  project_id?: number;
  created_at: string;
  updated_at: string;
}

class SkillService {
  getAll(): AgentSkill[] {
    return getDb()
      .prepare('SELECT * FROM agent_skills ORDER BY order_index ASC, created_at ASC')
      .all() as AgentSkill[];
  }

  getById(id: string): AgentSkill | undefined {
    return getDb()
      .prepare('SELECT * FROM agent_skills WHERE id = ?')
      .get(id) as AgentSkill | undefined;
  }

  getActive(): AgentSkill[] {
    return getDb()
      .prepare('SELECT * FROM agent_skills WHERE enabled = 1 ORDER BY order_index ASC, created_at ASC')
      .all() as AgentSkill[];
  }

  create(data: { name: string; description?: string; content: string }): AgentSkill {
    const db = getDb();
    const id = randomUUID();
    const maxOrder = (db.prepare('SELECT MAX(order_index) as m FROM agent_skills').get() as any)?.m || 0;

    db.prepare(
      `INSERT INTO agent_skills (id, name, description, content, order_index)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, data.name, data.description || '', data.content, maxOrder + 1);

    return this.getById(id)!;
  }

  update(id: string, data: { name?: string; description?: string; content?: string }): AgentSkill | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    getDb().prepare(
      `UPDATE agent_skills SET name = ?, description = ?, content = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(
      data.name ?? existing.name,
      data.description ?? existing.description,
      data.content ?? existing.content,
      id
    );

    return this.getById(id);
  }

  remove(id: string): boolean {
    const result = getDb().prepare('DELETE FROM agent_skills WHERE id = ?').run(id);
    return result.changes > 0;
  }

  toggle(id: string): AgentSkill | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    getDb().prepare(
      'UPDATE agent_skills SET enabled = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(existing.enabled ? 0 : 1, id);

    return this.getById(id);
  }

  /** 批次 upsert by name */
  batchImport(skills: Array<{ name: string; description?: string; content: string }>): { imported: number; updated: number } {
    const db = getDb();
    let imported = 0;
    let updated = 0;

    const upsert = db.transaction(() => {
      for (const skill of skills) {
        const existing = db.prepare('SELECT id FROM agent_skills WHERE name = ?').get(skill.name) as { id: string } | undefined;
        if (existing) {
          db.prepare(
            `UPDATE agent_skills SET description = ?, content = ?, updated_at = datetime('now') WHERE id = ?`
          ).run(skill.description || '', skill.content, existing.id);
          updated++;
        } else {
          const maxOrder = (db.prepare('SELECT MAX(order_index) as m FROM agent_skills').get() as any)?.m || 0;
          db.prepare(
            `INSERT INTO agent_skills (id, name, description, content, order_index) VALUES (?, ?, ?, ?, ?)`
          ).run(randomUUID(), skill.name, skill.description || '', skill.content, maxOrder + 1);
          imported++;
        }
      }
    });

    upsert();
    return { imported, updated };
  }

  /**
   * 用 AI 從啟用的 skill 中篩選出跟目標頁面相關的
   * 輕量 call：只傳 name + description，不傳 content
   */
  async selectRelevant(pageUrl: string, pageTitle: string): Promise<AgentSkill[]> {
    const active = this.getActive();
    console.log(`[skillService] selectRelevant: ${active.length} active skills for ${pageUrl}`);
    if (active.length === 0) return [];
    if (active.length <= 3) return active; // 3 個以下全用

    const apiKey = getGeminiApiKey();
    if (!apiKey) { console.warn('[skillService] 沒有 API key'); return active.slice(0, 3); }

    const model = getGeminiModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const skillList = active.map((s, i) => `${i + 1}. ${s.name}: ${s.description}`).join('\n');

    const prompt = `你是一個前端 QA 測試專家。我要對以下頁面做 UI/UX 測試：

URL: ${pageUrl}
標題: ${pageTitle}

以下是可用的領域知識（Skills）。注意：有些是前端/C端使用者體驗知識，有些是後端/管理後台知識。
**只選對前端 UI 測試直接有用的**（如：C端頁面行為、搜尋篩選邏輯、前端架構、UX 設計規範）。
**不要選後端排程 Job、資料庫同步、API 內部實作、管理後台功能**。

${skillList}

回傳相關 skill 的編號（逗號分隔），例如：1,3,5
如果沒有跟前端 UI 測試相關的，回傳 "none"`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 50 },
        }),
      });
      const json = await res.json();

      if (json.usageMetadata) {
        trackUsage(apiKey, model, 'skill_select', json.usageMetadata);
      }

      const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      console.log(`[skillService] AI 回傳: "${text}"`);
      if (text === 'none' || !text) {
        console.log(`[skillService] AI 判斷無相關 skill，不注入`);
        return [];
      }

      const indices = text.split(',').map((s: string) => parseInt(s.trim()) - 1).filter((i: number) => !isNaN(i) && i >= 0 && i < active.length);
      const selected: AgentSkill[] = indices.map((i: number) => active[i]);
      console.log(`[skillService] 選中: ${selected.map((s: AgentSkill) => s.name).join(', ')}`);
      return selected;
    } catch (err) {
      console.error('[skillService] selectRelevant 失敗，fallback 取前 3:', err);
      return active.slice(0, 3);
    }
  }

  /** 格式化指定的 skill 為 prompt 注入文字 */
  formatSkillsForPrompt(skills: AgentSkill[], maxContentLength = 2000): string {
    if (skills.length === 0) return '';

    const blocks = skills.map(s => {
      const content = s.content.length > maxContentLength
        ? s.content.slice(0, maxContentLength) + '\n...（已截斷）'
        : s.content;
      return `### ${s.name}\n${s.description ? `_${s.description}_\n` : ''}${content}`;
    });

    return `=== 領域知識（AI Skills） ===\n\n${blocks.join('\n\n')}\n\n===========================`;
  }

  /** 格式化啟用的 skill 為 prompt 注入文字（舊方法，保留相容） */
  formatForPrompt(maxSkills = 5, maxContentLength = 2000): string {
    const skills = this.getActive().slice(0, maxSkills);
    return this.formatSkillsForPrompt(skills, maxContentLength);
  }

  /** 取得特定 project 的 enabled skill，按 order_index 排序 */
  getProjectSkills(projectId: number): AgentSkill[] {
    return getDb()
      .prepare('SELECT * FROM agent_skills WHERE project_id = ? AND enabled = 1 ORDER BY order_index ASC, created_at ASC')
      .all(projectId) as AgentSkill[];
  }

  /** 從規格書內容用 AI 生成 project skill */
  async generateFromSpec(projectId: number, specContent: string): Promise<AgentSkill[]> {
    if (specContent.length < 500) return [];

    const db = getDb();
    // 刪除舊的 project skill
    db.prepare('DELETE FROM agent_skills WHERE project_id = ?').run(projectId);

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      console.warn('[skillService] generateFromSpec: 沒有 API key');
      return [];
    }

    const model = getGeminiModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const prompt = `你是一個 QA 知識萃取專家。以下是一個產品的規格書大綱。
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

規格書大綱：
${specContent}

只回傳 JSON: { "skills": [{ "name": "...", "description": "...", "content": "..." }] }`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
        }),
      });
      const json = await res.json();

      if (json.usageMetadata) {
        trackUsage(apiKey, model, 'skill_generate', json.usageMetadata);
      }

      const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      let cleaned = text.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // 嘗試修復截斷的 JSON
        let fixed = cleaned;
        const lastBrace = fixed.lastIndexOf('}');
        if (lastBrace > 0) fixed = fixed.slice(0, lastBrace + 1);
        const openBrackets = (fixed.match(/\[/g) || []).length;
        const closeBrackets = (fixed.match(/\]/g) || []).length;
        for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += ']';
        const openBraces = (fixed.match(/\{/g) || []).length;
        const closeBraces = (fixed.match(/\}/g) || []).length;
        for (let i = 0; i < openBraces - closeBraces; i++) fixed += '}';
        parsed = JSON.parse(fixed);
      }
      const skills: Array<{ name: string; description: string; content: string }> = parsed.skills || [];

      const created: AgentSkill[] = [];
      for (let i = 0; i < skills.length; i++) {
        const s = skills[i];
        const id = randomUUID();
        db.prepare(
          `INSERT INTO agent_skills (id, name, description, content, order_index, project_id)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(id, s.name, s.description || '', s.content, i + 1, projectId);
        created.push(this.getById(id)!);
      }

      console.log(`[skillService] generateFromSpec: 為 project ${projectId} 生成 ${created.length} 個 skill`);
      return created;
    } catch (err) {
      console.error('[skillService] generateFromSpec 失敗:', err);
      return [];
    }
  }

  /** 格式化特定 project 的 skill 為 prompt 注入文字 */
  formatProjectSkillsForPrompt(projectId: number, maxContentLength = 2000): string {
    const skills = this.getProjectSkills(projectId);
    return this.formatSkillsForPrompt(skills, maxContentLength);
  }
}

export const skillService = new SkillService();
