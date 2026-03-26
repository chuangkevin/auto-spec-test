/**
 * 測試協調器 — 多 AI 討論、執行、驗證、調整迴圈
 *
 * 流程：
 * 1. 討論 (discuss) — 多 AI 角色分析頁面，提出測試策略
 * 2. 總結 (summarize) — 整合討論，產出最終測試計畫
 * 3. 執行 (execute) — 逐案例執行
 * 4. 驗證 (verify) — 分析結果，區分真 bug vs 測試問題
 * 5. 調整 (adjust) — 修正有問題的測試案例，重跑
 * 6. 最終報告 (finalize) — 只保留有效結果
 */

import { getGeminiApiKey, getGeminiModel, trackUsage } from './geminiKeys.js';

interface DiscussionMessage {
  role: 'qa_lead' | 'frontend_expert' | 'ux_specialist' | 'security_tester';
  message: string;
}

interface TestPlanReview {
  approved: boolean;
  adjustments: Array<{
    caseId: string;
    action: 'remove' | 'modify' | 'retry';
    reason: string;
    newSteps?: any[];
  }>;
  summary: string;
}

async function callGemini(prompt: string, images?: string[]): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('No API key');
  const model = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const parts: any[] = [{ text: prompt }];
  if (images) {
    for (const img of images) {
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: img } });
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
    }),
  });

  const json = await res.json();
  if (json.usageMetadata && apiKey) {
    trackUsage(apiKey, model, 'orchestrator', json.usageMetadata);
  }
  return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function cleanJson(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return JSON.parse(cleaned);
}

export class TestOrchestrator {
  /**
   * 階段 1: 多 AI 討論測試策略
   */
  async discuss(
    screenshot: string,
    elements: any[],
    behaviors: any[],
    pageInfo: { url: string; title: string }
  ): Promise<DiscussionMessage[]> {
    const context = `頁面：${pageInfo.title} (${pageInfo.url})
元件數：${elements.length}
已探索行為：${behaviors.filter(b => b.type !== 'no_effect').map(b => `${b.type}: ${b.description}`).join(', ')}`;

    const messages: DiscussionMessage[] = [];

    // QA Lead
    const qaPrompt = `你是 QA Lead。分析以下網頁，提出測試重點和策略（3-5 點，每點一句話）：
${context}

只回傳 JSON: { "message": "你的分析" }`;
    try {
      const qaRes = cleanJson(await callGemini(qaPrompt, [screenshot]));
      messages.push({ role: 'qa_lead', message: qaRes.message });
    } catch { messages.push({ role: 'qa_lead', message: '建議優先測試核心功能流程' }); }

    // Frontend Expert
    const fePrompt = `你是前端技術專家。分析以下網頁的技術特徵和潛在問題（3-5 點）：
${context}

QA Lead 的意見：${messages[0]?.message || ''}

只回傳 JSON: { "message": "你的分析" }`;
    try {
      const feRes = cleanJson(await callGemini(fePrompt, [screenshot]));
      messages.push({ role: 'frontend_expert', message: feRes.message });
    } catch { messages.push({ role: 'frontend_expert', message: '注意動態載入和非同步操作' }); }

    // UX Specialist
    const uxPrompt = `你是 UX 測試專家。從使用者體驗角度分析以下網頁需要測試什麼（3-5 點）：
${context}

其他人的意見：
- QA Lead: ${messages[0]?.message || ''}
- 前端專家: ${messages[1]?.message || ''}

只回傳 JSON: { "message": "你的分析" }`;
    try {
      const uxRes = cleanJson(await callGemini(uxPrompt, [screenshot]));
      messages.push({ role: 'ux_specialist', message: uxRes.message });
    } catch { messages.push({ role: 'ux_specialist', message: '關注使用者操作流程和錯誤處理' }); }

    return messages;
  }

  /**
   * 階段 2: 總結討論，產出測試計畫
   * （由 pageScannerService.scanPage 處理，這裡把討論結果加入 prompt）
   */
  formatDiscussionForPrompt(discussion: DiscussionMessage[]): string {
    if (discussion.length === 0) return '';
    return `## AI 團隊討論結果
${discussion.map(d => {
  const roleLabel: Record<string, string> = {
    qa_lead: 'QA Lead',
    frontend_expert: '前端專家',
    ux_specialist: 'UX 專家',
    security_tester: '安全測試',
  };
  return `### ${roleLabel[d.role] || d.role}\n${d.message}`;
}).join('\n\n')}

請根據以上團隊討論結果，產出更全面的測試計畫。
`;
  }

  /**
   * 階段 4+5: 驗證結果 + 調整
   * 分析失敗的測試案例，判斷是真 bug 還是測試問題
   */
  async reviewResults(
    testCases: any[],
    results: Array<{ caseId: string; passed: boolean; actualResult: string; error?: string }>,
    screenshot: string
  ): Promise<TestPlanReview> {
    const failedCases = results.filter(r => !r.passed);
    if (failedCases.length === 0) {
      return { approved: true, adjustments: [], summary: '所有測試案例通過' };
    }

    const failedSummary = failedCases.map(r => {
      const tc = testCases.find((t: any) => t.id === r.caseId);
      return `${r.caseId} ${tc?.name || ''}: ${r.actualResult?.slice(0, 100)}${r.error ? ` [錯誤: ${r.error.slice(0, 80)}]` : ''}`;
    }).join('\n');

    const prompt = `你是 QA Lead。以下測試案例執行失敗，請分析每個失敗是「真正的 Bug」還是「測試腳本問題」。

失敗的案例：
${failedSummary}

請對每個失敗案例判斷：
- 如果是真 Bug → action: "keep"（保留結果）
- 如果是 selector 找不到等測試腳本問題 → action: "retry"（建議重試）
- 如果是無意義的測試 → action: "remove"（移除）

只回傳 JSON:
{
  "approved": false,
  "summary": "總結（30字內）",
  "adjustments": [
    { "caseId": "TC-001", "action": "keep|retry|remove", "reason": "原因（20字內）" }
  ]
}`;

    try {
      const result = cleanJson(await callGemini(prompt, [screenshot]));
      return result;
    } catch {
      return {
        approved: true,
        adjustments: [],
        summary: '無法分析失敗原因，保留所有結果',
      };
    }
  }
}

export const testOrchestrator = new TestOrchestrator();
