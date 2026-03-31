import { randomUUID } from 'node:crypto';
import { getDb } from '../db/connection.js';

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

  /** 格式化啟用的 skill 為 prompt 注入文字 */
  formatForPrompt(maxSkills = 5, maxContentLength = 2000): string {
    const skills = this.getActive().slice(0, maxSkills);
    if (skills.length === 0) return '';

    const blocks = skills.map(s => {
      const content = s.content.length > maxContentLength
        ? s.content.slice(0, maxContentLength) + '\n...（已截斷）'
        : s.content;
      return `### ${s.name}\n${s.description ? `_${s.description}_\n` : ''}${content}`;
    });

    return `=== 領域知識（AI Skills） ===\n\n${blocks.join('\n\n')}\n\n===========================`;
  }
}

export const skillService = new SkillService();
