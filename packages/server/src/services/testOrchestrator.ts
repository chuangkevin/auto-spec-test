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

import { generateRuntimeText } from './aiRuntimeService.js';
import { skillService } from './skillService.js';

export interface DiscussionMessage {
  role: string;
  name: string;
  avatar: string;
  message: string;
  focusAreas?: string[];
  risks?: string[];
  evidenceBasis?: string[];
  fallbackUsed?: boolean;
}

const AI_AGENTS = {
  echo: { name: 'Echo', role: 'QA 策略師', avatar: '🎯' },
  lisa: { name: 'Lisa', role: '前端技術專家', avatar: '💻' },
  bob: { name: 'Bob', role: 'UX 體驗分析師', avatar: '🎨' },
  james: { name: 'James', role: '測試執行者', avatar: '🧪' },
  sophia: { name: 'Sophia', role: '安全審查員', avatar: '🔒' },
};

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
  return generateRuntimeText({
    prompt,
    callType: 'orchestrator',
    maxOutputTokens: 4096,
    images: images?.map((img) => ({ mimeType: 'image/jpeg', data: img })),
  });
}

function cleanJson(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return JSON.parse(cleaned);
}

function normalizeStringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;

  const normalized = value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 4);

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeDiscussionPayload(
  agent: { name: string; role: string; avatar: string },
  payload: any,
  fallback: Pick<DiscussionMessage, 'message' | 'focusAreas' | 'risks' | 'evidenceBasis'>,
  fallbackUsed = false
): DiscussionMessage {
  return {
    ...agent,
    message: String(payload?.message || fallback.message).trim(),
    focusAreas: normalizeStringList(payload?.focusAreas, fallback.focusAreas || []),
    risks: normalizeStringList(payload?.risks, fallback.risks || []),
    evidenceBasis: normalizeStringList(payload?.evidenceBasis, fallback.evidenceBasis || []),
    fallbackUsed,
  };
}

export class TestOrchestrator {
  /**
   * 階段 1: 多 AI 討論測試策略
   */
  async discuss(
    screenshot: string,
    elements: any[],
    behaviors: any[],
    pageInfo: { url: string; title: string },
    broadcast?: (msg: any) => void,
    projectId?: number,
    specContent?: string
  ): Promise<DiscussionMessage[]> {
    // 優先用 project skill
    let skillsBlock = '';
    if (projectId) {
      const projectSkills = skillService.getProjectSkills(projectId);
      if (projectSkills.length > 0) {
        console.log(`[discuss] 使用 ${projectSkills.length} 個 project skill`);
        skillsBlock = skillService.formatSkillsForPrompt(projectSkills, 2000);
      }
    }
    if (!skillsBlock) {
      // fallback to selectRelevant
      try {
        const relevantSkills = await skillService.selectRelevant(pageInfo.url, pageInfo.title);
        console.log(`[discuss] skill 篩選結果: ${relevantSkills.length} 個 — ${relevantSkills.map(s => s.name).join(', ') || '無'}`);
        if (relevantSkills.length > 0) {
          skillsBlock = skillService.formatSkillsForPrompt(relevantSkills, 2000);
        }
      } catch (err) {
        console.error('[discuss] skill 篩選失敗:', err);
      }
    }

    const pageContext = `頁面：${pageInfo.title} (${pageInfo.url})
元件數：${elements.length}
已探索行為：${behaviors.filter(b => b.type !== 'no_effect').map(b => `${b.type}: ${b.description}`).join(', ')}`;

    // 如果有 skill，在 prompt 中明確要求 Agent 根據領域知識分析
    const skillInstruction = skillsBlock
      ? `\n\n**重要：你擁有以下領域知識，請務必根據這些知識來分析測試重點。如果領域知識提到特定業務規則、流程、或注意事項，你必須在發言中提及。**\n\n${skillsBlock}`
      : '';

    // 如果有規格書，注入到 Echo 的 prompt 中
    const specInstruction = specContent
      ? `\n\n## 正式規格書（最高優先）\n以下是此產品的正式規格書。你的討論必須以規格書的功能需求為出發點，不是以截圖觀察為出發點。先問「spec 要求測什麼」，再問「頁面有沒有實作」。\n\n${specContent.slice(0, 2000)}`
      : '';

    const messages: DiscussionMessage[] = [];
    const send = (msg: DiscussionMessage) => {
      messages.push(msg);
      if (broadcast) broadcast({ type: 'discussion', data: msg });
    };

    // Echo (QA 策略師) — 先發言
    const echoPrompt = `你是 Echo，一位資深 QA 策略師。用口語化、有個性的方式分析這個網頁，說出你認為的測試重點。像是在跟同事開會討論一樣，不要太正式。2-4 句話。${specInstruction ? '\n\n你必須根據規格書的功能需求來規劃測試方向，不要只看截圖表面。' : (skillInstruction ? '\n\n你必須根據領域知識中的業務規則來規劃測試方向，不要只看截圖表面。' : '')}

${pageContext}${specInstruction}${skillInstruction}

只回傳 JSON:
{
  "message": "你的發言（口語化，如果有規格書或領域知識請務必引用）",
  "focusAreas": ["需要被測試覆蓋的功能或流程，1-3項"],
  "risks": ["最容易失敗或誤判的風險，0-2項"],
  "evidenceBasis": ["你主要根據哪些證據判斷，例如 規格書 / 截圖 / DOM / 領域知識"]
}`;
    try {
      const res = cleanJson(await callGemini(echoPrompt, [screenshot]));
      send(normalizeDiscussionPayload(AI_AGENTS.echo, res, {
        message: '這個頁面核心功能流程是重點，我們先把主要路徑跑通再說。',
        focusAreas: ['主要使用者流程'],
        risks: ['核心流程可能只做表面驗證'],
        evidenceBasis: specContent ? ['規格書', '截圖'] : ['截圖', 'DOM'],
      }, false));
    } catch {
      send(normalizeDiscussionPayload(AI_AGENTS.echo, null, {
        message: '這個頁面核心功能流程是重點，我們先把主要路徑跑通再說。',
        focusAreas: ['主要使用者流程'],
        risks: ['核心流程可能只做表面驗證'],
        evidenceBasis: specContent ? ['規格書', '截圖'] : ['截圖', 'DOM'],
      }, true));
    }

    // Lisa (前端專家) — 回應 Echo，補充技術觀點
    const lisaPrompt = `你是 Lisa，一位前端技術專家。你的同事 Echo 剛說了：「${messages[0]?.message || ''}」

你要回應他，並從技術角度補充你的看法。像是在跟同事討論一樣，可以同意也可以提出不同意見。2-4 句話。${specInstruction ? '\n\n根據規格書，請補充技術實作細節（如 URL 格式、API 行為、元件互動）。' : (skillInstruction ? '\n\n如果領域知識中有技術細節（如 API、資料流、元件行為），請引用並補充。' : '')}

${pageContext}${specInstruction}${skillInstruction}

只回傳 JSON:
{
  "message": "你的回應（口語化，引用規格書或領域知識中的技術細節）",
  "focusAreas": ["需要被測試覆蓋的技術互動，1-3項"],
  "risks": ["selector、URL、資料流或狀態上的風險，0-2項"],
  "evidenceBasis": ["你主要根據哪些證據判斷，例如 規格書 / DOM / 領域知識"]
}`;
    try {
      const res = cleanJson(await callGemini(lisaPrompt, [screenshot]));
      send(normalizeDiscussionPayload(AI_AGENTS.lisa, res, {
        message: '同意 Echo 的看法，但我想補充一點 — 要特別注意動態載入的元件，selector 可能不穩定。',
        focusAreas: ['技術互動與導航行為'],
        risks: ['selector 不穩定'],
        evidenceBasis: specContent ? ['規格書', 'DOM'] : ['DOM', '截圖'],
      }, false));
    } catch {
      send(normalizeDiscussionPayload(AI_AGENTS.lisa, null, {
        message: '同意 Echo 的看法，但我想補充一點 — 要特別注意動態載入的元件，selector 可能不穩定。',
        focusAreas: ['技術互動與導航行為'],
        risks: ['selector 不穩定'],
        evidenceBasis: specContent ? ['規格書', 'DOM'] : ['DOM', '截圖'],
      }, true));
    }

    // Bob (UX 分析師) — 回應前兩人，從 UX 角度切入
    const bobPrompt = `你是 Bob，一位 UX 體驗分析師。你的同事們討論了：
- Echo: ${messages[0]?.message || ''}
- Lisa: ${messages[1]?.message || ''}

你要從使用者體驗的角度回應，可以贊同、反駁或提出新觀點。像是在跟同事討論一樣。2-4 句話。${specInstruction ? '\n\n根據規格書，請從 UX 角度確認規格書描述的流程是否在頁面中正確實作。' : (skillInstruction ? '\n\n如果領域知識中有 UX 相關規則（如流程、提示、錯誤處理），請引用。' : '')}

${pageContext}${specInstruction}${skillInstruction}

只回傳 JSON:
{
  "message": "你的回應（口語化，引用規格書或領域知識中的 UX 要求）",
  "focusAreas": ["需要被測試覆蓋的 UX 流程或提示，1-3項"],
  "risks": ["使用者最容易卡住或誤解的地方，0-2項"],
  "evidenceBasis": ["你主要根據哪些證據判斷，例如 規格書 / 截圖 / 使用者流程"]
}`;
    try {
      const res = cleanJson(await callGemini(bobPrompt, [screenshot]));
      send(normalizeDiscussionPayload(AI_AGENTS.bob, res, {
        message: '你們說的都對，但別忘了從使用者的角度看 — 操作流程順不順暢、錯誤提示清不清楚，這些才是最容易出包的地方。',
        focusAreas: ['使用者流程順暢度', '錯誤提示與回饋'],
        risks: ['流程中斷或提示不清楚'],
        evidenceBasis: specContent ? ['規格書', '截圖'] : ['截圖', '使用者流程'],
      }, false));
    } catch {
      send(normalizeDiscussionPayload(AI_AGENTS.bob, null, {
        message: '你們說的都對，但別忘了從使用者的角度看 — 操作流程順不順暢、錯誤提示清不清楚，這些才是最容易出包的地方。',
        focusAreas: ['使用者流程順暢度', '錯誤提示與回饋'],
        risks: ['流程中斷或提示不清楚'],
        evidenceBasis: specContent ? ['規格書', '截圖'] : ['截圖', '使用者流程'],
      }, true));
    }

    return messages;
  }

  /** 取得測試執行者名稱 */
  getExecutorName(): typeof AI_AGENTS.james {
    return AI_AGENTS.james;
  }

  /**
   * 階段 2: 總結討論，提取結構化測試重點清單
   */
  formatDiscussionForPrompt(discussion: DiscussionMessage[]): string {
    if (discussion.length === 0) return '';

    const rawDiscussion = discussion
      .map(d => `${d.name}（${d.role}）: ${d.message}`)
      .join('\n');

    const focusAreas = Array.from(new Set(
      discussion.flatMap((d) => d.focusAreas || []).map((item) => item.trim()).filter(Boolean)
    ));
    const risks = Array.from(new Set(
      discussion.flatMap((d) => d.risks || []).map((item) => item.trim()).filter(Boolean)
    ));
    const evidenceLines = discussion
      .map((d) => {
        const basis = (d.evidenceBasis || []).filter(Boolean).join('、');
        return basis ? `- ${d.name}: ${basis}` : '';
      })
      .filter(Boolean)
      .join('\n');

    const focusBlock = focusAreas.length > 0
      ? focusAreas.map((item, index) => `${index + 1}. ${item}`).join('\n')
      : '1. 主要使用者流程';
    const riskBlock = risks.length > 0
      ? risks.map((item, index) => `${index + 1}. ${item}`).join('\n')
      : '1. selector 或流程判斷可能失準';
    const evidenceBlock = evidenceLines || '- Echo/Lisa/Bob: 截圖、DOM、規格書或 skills';

    return `## AI 團隊討論紀錄
${rawDiscussion}

## 聚合後的 Focus Areas（每項至少一個測試案例）
${focusBlock}

## 聚合後的 Risks（測試案例或預期要回應）
${riskBlock}

## 各 Agent 主要證據依據
${evidenceBlock}

## 必須覆蓋的測試重點（硬性要求）

請根據上方 Focus Areas、Risks 與原始討論來產出測試計畫，並遵守：

1. **為每個 focus area 產出至少一個測試案例**
2. 測試案例必須回應 risks 中提到的失敗風險或 UX 風險
3. 在每個測試案例的 name 或 category 中標註它對應的 focus area
4. 如果討論提到某功能但頁面 DOM 中找不到對應元素，在 testPlan 最後加一個 category="missing" 的案例標記該功能缺失

**這是硬性要求：討論中提到的每個測試方向都必須有對應的 TC，不能遺漏。**
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

  /**
   * Fix 4: 驗證測試計畫對規格書的覆蓋率
   * 回傳未被任何 TC 覆蓋的規格書章節清單
   */
  async verifySpecCoverage(specContent: string, testPlan: any[]): Promise<string[]> {
    if (!specContent || testPlan.length === 0) return [];

    const tcSummary = testPlan
      .map((tc: any) => `${tc.id} [${tc.category}] ${tc.name}: ${tc.expectedResult || ''}`)
      .join('\n');

    const prompt = `你是 QA Lead。請分析以下規格書和測試計畫，找出規格書中哪些 ## 功能模組沒有對應的測試案例。

## 規格書內容（節錄）
${specContent.slice(0, 3000)}

## 現有測試計畫
${tcSummary}

請逐一檢查規格書的每個 ## 章節，判斷是否有至少一個 TC 涵蓋該章節的主要功能。

只回傳 JSON:
{
  "uncovered": ["未覆蓋的章節名稱1", "未覆蓋的章節名稱2"]
}

如果全部都有覆蓋，回傳 { "uncovered": [] }`;

    try {
      const result = cleanJson(await callGemini(prompt));
      return result.uncovered || [];
    } catch {
      return [];
    }
  }
}

export const testOrchestrator = new TestOrchestrator();
