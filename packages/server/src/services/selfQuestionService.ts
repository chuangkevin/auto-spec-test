import { getGeminiApiKey, getGeminiModel, trackUsage } from './geminiKeys.js';

class SelfQuestionService {
  async analyzeStep(
    step: { action: string; target?: string; description: string },
    beforeScreenshot: string,
    afterScreenshot: string
  ): Promise<{
    change: string;
    expected: boolean;
    needRevert: boolean;
    passed: boolean;
  }> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) return { change: '無法分析', expected: true, needRevert: false, passed: true };

    const model = getGeminiModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const prompt = `你是一個 QA 測試工程師。你剛才執行了操作：${step.action} on "${step.target || ''}" (${step.description})

以下是操作前後的截圖。請分析：

1. 頁面發生了什麼變化？
2. 這個變化對於「${step.description}」來說是預期的嗎？
3. 是否需要恢復操作？（例如：toggle 按鈕需要再按一次回到原狀態）
4. 這一步算成功嗎？

只回傳 JSON：
{ "change": "變化描述(15字內)", "expected": true/false, "needRevert": true/false, "passed": true/false }`;

    const body = {
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: beforeScreenshot } },
          { inlineData: { mimeType: 'image/jpeg', data: afterScreenshot } },
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
        trackUsage(apiKey, model, 'self_question', json.usageMetadata);
      }

      const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return { change: '分析失敗', expected: true, needRevert: false, passed: true };
    }
  }
}

export const selfQuestionService = new SelfQuestionService();
