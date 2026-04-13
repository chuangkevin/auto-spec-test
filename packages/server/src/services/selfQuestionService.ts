import { generateRuntimeText } from './aiRuntimeService.js';

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
    const prompt = `你是一個 QA 測試工程師。你剛才執行了操作：${step.action} on "${step.target || ''}" (${step.description})

以下是操作前後的截圖。請分析：

1. 頁面發生了什麼變化？
2. 這個變化對於「${step.description}」來說是預期的嗎？
3. 是否需要恢復操作？（例如：toggle 按鈕需要再按一次回到原狀態）
4. 這一步算成功嗎？

只回傳 JSON：
{ "change": "變化描述(15字內)", "expected": true/false, "needRevert": true/false, "passed": true/false }`;

    try {
      const text = await generateRuntimeText({
        prompt,
        callType: 'self_question',
        maxOutputTokens: 256,
        images: [
          { mimeType: 'image/jpeg', data: beforeScreenshot },
          { mimeType: 'image/jpeg', data: afterScreenshot },
        ],
      });
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return { change: '分析失敗', expected: true, needRevert: false, passed: true };
    }
  }
}

export const selfQuestionService = new SelfQuestionService();
