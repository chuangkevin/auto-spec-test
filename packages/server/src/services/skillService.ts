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

    const prompt = `你是一個 QA 測試專家。以下是一組**產品內部領域知識**（Skills），這些 Skills 描述的都是同一個產品/公司的不同面向。

我要測試的頁面：
URL: ${pageUrl}
標題: ${pageTitle}

可用的 Skills（都是這個產品的內部知識）：
${skillList}

請選出與這個頁面**最可能相關**的 Skills（最多 5 個）。
- URL 的 domain 和 skill 描述的系統很可能是同一個產品的不同模組
- 寧可多選也不要漏掉，因為相關的知識對測試品質很重要
- 只回傳編號，用逗號分隔，例如：1,3,5
- 只有完全確定都不相關時才回傳 "none"`;

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
        // Fallback: 用 URL path + 標題關鍵字匹配，按匹配分數排序
        const urlPath = new URL(pageUrl).pathname.toLowerCase();
        const urlHost = new URL(pageUrl).hostname.toLowerCase();
        const titleWords = pageTitle.toLowerCase().split(/[\s|｜\-–—，,]+/).filter(k => k.length > 1);
        const allKeywords = [urlHost, ...urlPath.split('/').filter(Boolean), ...titleWords];

        const scored = active.map(s => {
          const hay = `${s.name} ${s.description} ${s.content.slice(0, 500)}`.toLowerCase();
          let score = 0;
          for (const kw of allKeywords) {
            if (hay.includes(kw)) score += kw.length; // 長關鍵字權重更高
          }
          return { skill: s, score };
        }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

        if (scored.length > 0) {
          const top = scored.slice(0, 5).map(x => x.skill);
          console.log(`[skillService] AI 回傳空，keyword fallback 選中: ${top.map(s => s.name).join(', ')}`);
          return top;
        }
        // 最終 fallback
        console.log(`[skillService] keyword 也沒匹配，fallback 取前 3`);
        return active.slice(0, 3);
      }

      const indices = text.split(',').map((s: string) => parseInt(s.trim()) - 1).filter((i: number) => i >= 0 && i < active.length);
      const selected = indices.map((i: number) => active[i]);
      console.log(`[skillService] 選中: ${selected.map(s => s.name).join(', ')}`);
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
}

export const skillService = new SkillService();
