import { randomUUID } from 'node:crypto';
import { getDb } from '../db/connection.js';
import { buildLearningEvidenceBlock } from './agentEvidenceService.js';
import { getGeminiApiKey, getGeminiModel, trackUsage } from './geminiKeys.js';

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: number;
  order_index: number;
  project_id?: number;
  verified?: number;
  created_at: string;
  updated_at: string;
}

interface DreamLearning {
  caseId: string;
  category: 'selector_issue' | 'url_format_issue' | 'spec_mismatch' | 'real_bug';
  skillToUpdate: string | null;
  suggestion: string;
  evidenceBasis?: string[];
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
      let content = s.content.length > maxContentLength
        ? s.content.slice(0, maxContentLength) + '\n...（已截斷）'
        : s.content;
      if (!s.verified) {
        content += '\n（⚠ 此規則未在規格書中完全驗證，僅供參考）';
      }
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

    const prompt = `你是一個 QA 自動化測試知識萃取專家。以下是一個產品的規格書大綱。
請從中提取 3-5 個最重要的業務規則，每個規則包含：
1. name: kebab-case 識別名（如 url-format-rules）
2. description: 一行描述（50 字內）
3. content: 精煉的規則內容（200-500 字），包含具體的格式、參數、邏輯

## 最重要：URL 格式必須有完整範例

第一個 skill **必須**是 URL 格式規則，且 content 中**必須包含**：
- 完整的 URL path 結構範例（如 /list/21_usage/5-10-8-12_zip/?p=1）
- 每個參數在 URL 中的位置（是在 path 裡還是 query string 裡）
- 分頁參數的格式（如 ?p=2）
- 排序參數的格式
- 至少 3 個不同場景的完整 URL 範例

## 其他提取重點
- 篩選/搜尋條件的交互邏輯（切換時哪些保留、哪些清空）
- 頁面狀態切換的行為規則
- SEO 規則（title 動態生成、noindex 條件）
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
          generationConfig: { temperature: 0.2, maxOutputTokens: 16384 },
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
      } catch (parseErr) {
        console.warn(`[skillService] JSON parse 失敗, text length=${cleaned.length}, last100=${cleaned.slice(-100)}`);
        console.warn(`[skillService] finishReason=${json.candidates?.[0]?.finishReason}`);

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

      // Strict Write Discipline: 驗證 key facts
      for (const skill of created) {
        let isVerified = false;
        // 提取 content 中的 URL pattern（如 /list/, _usage/, _zip/, ?p=）
        const urlPatterns = skill.content.match(/\/[a-z_]+\/|_usage|_zip|_mrt|\?p=|\?sort=|\?kw=/g) || [];
        // 在規格書原文中搜尋
        if (urlPatterns.length > 0) {
          const found = urlPatterns.filter(p => specContent.includes(p));
          isVerified = found.length >= urlPatterns.length * 0.5; // 50% 以上找到就算 verified
        } else {
          // 沒有 URL pattern，搜尋其他 key terms
          const keyTerms = skill.content.match(/「[^」]+」/g) || [];
          const found = keyTerms.filter(t => specContent.includes(t.replace(/[「」]/g, '')));
          isVerified = keyTerms.length === 0 || found.length >= keyTerms.length * 0.3;
        }
        if (isVerified) {
          db.prepare('UPDATE agent_skills SET verified = 1 WHERE id = ?').run(skill.id);
          skill.verified = 1;
        }
      }
      console.log(`[skillService] 驗證結果: ${created.filter(s => s.verified).length}/${created.length} verified`);

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

  async dream(projectId: number, testResults: Array<{ caseId: string; name: string; passed: boolean; actualResult: string; error?: string; evidenceProvenance?: string[] }>): Promise<void> {
    const failed = testResults.filter(r => !r.passed);
    if (failed.length === 0) return;

    const projectSkills = this.getProjectSkills(projectId);
    if (projectSkills.length === 0) return;

    const apiKey = getGeminiApiKey();
    if (!apiKey) return;

    const model = getGeminiModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const failedSummary = failed.map(r =>
      `${r.caseId} ${r.name}: ${(r.actualResult || '').slice(0, 200)}${r.error ? ` [Error: ${r.error.slice(0, 100)}]` : ''}${r.evidenceProvenance && r.evidenceProvenance.length > 0 ? ` [Evidence: ${r.evidenceProvenance.join(', ')}]` : ''}`
    ).join('\n');

    const skillNames = projectSkills.map(s => s.name).join(', ');

    const prompt = `你是一個 QA 學習助手。以下測試案例失敗了，請分析原因並建議更新哪個 skill。

失敗的測試案例：
${failedSummary}

可用的 Project Skills: ${skillNames}

${buildLearningEvidenceBlock(projectSkills.map((s) => s.name))}

請對每個失敗案例分類：
- selector_issue: selector 找不到或 timeout → 建議修正
- url_format_issue: URL 格式錯誤 → 建議正確格式
- spec_mismatch: 預期結果與實際不符 → 可能是測試預期錯誤
- real_bug: 真正的頁面 bug → 不需要修改 skill

只回傳 JSON:
{ "learnings": [{ "caseId": "TC-001", "category": "selector_issue|url_format_issue|spec_mismatch|real_bug", "skillToUpdate": "skill-name-or-null", "suggestion": "建議內容（50字內）", "evidenceBasis": ["actualResult", "error", "current skill"] }] }`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
        }),
      });
      const json = await res.json();
      if (json.usageMetadata) trackUsage(apiKey, model, 'dream', json.usageMetadata);

      const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      let cleaned = text.trim();
      if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');

      const parsed = JSON.parse(cleaned);
      const learnings = Array.isArray(parsed.learnings)
        ? parsed.learnings
            .map((learning: any): DreamLearning | null => {
              const caseId = String(learning?.caseId || '').trim();
              const category = String(learning?.category || '').trim() as DreamLearning['category'];
              const suggestion = String(learning?.suggestion || '').trim();
              const skillToUpdate = learning?.skillToUpdate ? String(learning.skillToUpdate).trim() : null;
              const evidenceBasis = Array.isArray(learning?.evidenceBasis)
                ? learning.evidenceBasis.map((item: unknown) => String(item || '').trim()).filter(Boolean).slice(0, 4)
                : [];

              if (!caseId || !suggestion) return null;
              if (!['selector_issue', 'url_format_issue', 'spec_mismatch', 'real_bug'].includes(category)) return null;

              return {
                caseId,
                category,
                skillToUpdate,
                suggestion,
                evidenceBasis,
              };
            })
            .filter(Boolean) as DreamLearning[]
        : [];

      // 自動 append 學習到的資訊到 skill
      const db = getDb();
      for (const learning of learnings) {
        if (!learning.skillToUpdate) continue;
        if (learning.category === 'real_bug') continue; // 真 bug 不動 skill

        const skill = projectSkills.find(s => s.name === learning.skillToUpdate);
        if (!skill) continue;

        const evidenceText = learning.evidenceBasis && learning.evidenceBasis.length > 0
          ? ` [依據: ${learning.evidenceBasis.join(' / ')}]`
          : '';
        const appendText = `\n\n---\n**[自動學習 ${new Date().toISOString().slice(0, 10)}]** ${learning.category}: ${learning.suggestion}${evidenceText}`;
        db.prepare('UPDATE agent_skills SET content = content || ?, updated_at = datetime(\'now\') WHERE id = ?')
          .run(appendText, skill.id);
      }

      console.log(`[dream] project ${projectId}: ${learnings.length} learnings, ${learnings.filter((l: any) => l.category !== 'real_bug').length} skill updates`);
    } catch (err) {
      console.error('[dream] 失敗:', err);
    }
  }
}

export const skillService = new SkillService();
