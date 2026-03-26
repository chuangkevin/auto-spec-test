import { browserService } from './browserService.js';
import { getGeminiApiKey, getGeminiModel, trackUsage } from './geminiKeys.js';

interface BehaviorResult {
  selector: string;
  type: 'toggle' | 'navigation' | 'modal' | 'dropdown' | 'form_submit' | 'no_effect';
  description: string;
}

export class ExplorerService {
  /** 探索頁面中各元素的行為 */
  async explorePage(sessionId: string): Promise<{
    behaviors: BehaviorResult[];
  }> {
    const elements = await browserService.getInteractiveElements(sessionId);
    const behaviors: BehaviorResult[] = [];

    // 只探索前 15 個重要元素（避免太久）
    const toExplore = elements
      .filter(el => ['button', 'a', 'select'].includes(el.tag) || el.role === 'button')
      .slice(0, 15);

    for (const el of toExplore) {
      const beforeScreenshot = await browserService.screenshot(sessionId);
      const beforeUrl = (await browserService.getPageInfo(sessionId)).url;

      try {
        await browserService.click(sessionId, el.selector);
        await new Promise(r => setTimeout(r, 800)); // 等待動畫/載入
      } catch {
        behaviors.push({ selector: el.selector, type: 'no_effect', description: '點擊無反應' });
        continue;
      }

      const afterScreenshot = await browserService.screenshot(sessionId);
      const afterUrl = (await browserService.getPageInfo(sessionId)).url;

      // 用 AI 比較前後差異
      const analysis = await this.analyzeChange(beforeScreenshot, afterScreenshot, beforeUrl, afterUrl, el);
      behaviors.push({ selector: el.selector, ...analysis } as BehaviorResult);

      // 如果是 navigation，回到原始頁面
      if (afterUrl !== beforeUrl) {
        try {
          await browserService.navigateTo(sessionId, beforeUrl);
          await new Promise(r => setTimeout(r, 500));
        } catch { /* ignore */ }
      }
      // 如果是 toggle/modal，嘗試恢復
      if (analysis.type === 'toggle' || analysis.type === 'modal') {
        try {
          await browserService.click(sessionId, el.selector);
          await new Promise(r => setTimeout(r, 300));
        } catch { /* ignore */ }
      }
    }

    return { behaviors };
  }

  /** 用 AI 分析前後截圖差異 */
  private async analyzeChange(
    before: string,
    after: string,
    beforeUrl: string,
    afterUrl: string,
    element: any
  ): Promise<{ type: string; description: string }> {
    // 如果 URL 變了，是 navigation
    if (afterUrl !== beforeUrl) {
      return { type: 'navigation', description: `導航到 ${afterUrl}` };
    }

    // 用 Gemini 比較兩張截圖
    const apiKey = getGeminiApiKey();
    if (!apiKey) return { type: 'no_effect', description: '無法分析（無 API Key）' };

    const model = getGeminiModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const prompt = `比較這兩張網頁截圖（點擊 <${element.tag}> "${element.text || element.name || ''}" 前後）。
URL 沒變（${beforeUrl}）。

請判斷點擊後的行為類型，只回傳 JSON：
{ "type": "toggle|modal|dropdown|no_effect", "description": "簡短描述變化（15字內）" }

toggle: 切換狀態（如暗黑模式、展開/收合）
modal: 出現彈窗/覆蓋層
dropdown: 出現下拉選單/選項列表
no_effect: 幾乎沒變化`;

    const body = {
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: before } },
          { inlineData: { mimeType: 'image/jpeg', data: after } },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      // 追蹤用量
      if (json.usageMetadata) {
        trackUsage(apiKey, model, 'explore_behavior', json.usageMetadata);
      }

      const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return { type: 'no_effect', description: '分析失敗' };
    }
  }
}

export const explorerService = new ExplorerService();
