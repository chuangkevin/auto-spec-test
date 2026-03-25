import { getGeminiApiKey, getGeminiApiKeyExcluding, getGeminiModel, trackUsage } from './geminiKeys.js';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

interface ComponentInfo {
  name: string;
  type: string; // form, navigation, button, link, etc.
  selector: string;
  description: string;
}

interface TestStep {
  action: 'click' | 'fill' | 'select' | 'wait' | 'assert' | 'navigate';
  target?: string; // selector
  value?: string;
  description: string;
}

interface TestCase {
  id: string; // TC-001, TC-002...
  name: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  steps: TestStep[];
  expectedResult: string;
}

interface ScanResult {
  components: ComponentInfo[];
  testPlan: TestCase[];
}

interface TestCaseResult {
  passed: boolean;
  actualResult: string;
  screenshot?: string;
  error?: string;
}

/** 呼叫 Gemini API（含重試與 key 輪替） */
async function callGeminiVision(
  prompt: string,
  imageBase64: string,
  callType: string,
  projectId?: string
): Promise<string> {
  let apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('沒有可用的 Gemini API Key，請在系統設定中新增。');
  }

  const model = getGeminiModel();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const body = {
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 429 && attempt < MAX_RETRIES) {
          console.warn(`[pageScannerService] 429 on key ...${apiKey!.slice(-4)}, 重試中...`);
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          const nextKey = getGeminiApiKeyExcluding(apiKey!);
          if (nextKey) apiKey = nextKey;
          continue;
        }
        throw new Error(`Gemini API 錯誤 (${res.status}): ${errText}`);
      }

      const json = await res.json();

      // 追蹤用量
      if (json.usageMetadata) {
        trackUsage(apiKey!, model, callType, json.usageMetadata, projectId);
      }

      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Gemini 回傳內容為空');
      }
      return text;
    } catch (err: any) {
      const msg = err?.message || '';
      const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
      if (is429 && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        const nextKey = getGeminiApiKeyExcluding(apiKey!);
        if (nextKey) apiKey = nextKey;
        continue;
      }
      throw err;
    }
  }

  throw new Error('AI API 呼叫失敗，已達最大重試次數。');
}

class PageScannerService {
  /** 掃描頁面，產出測試計畫 */
  async scanPage(
    screenshotBase64: string,
    elements: Array<any>,
    pageInfo: { url: string; title: string },
    specContent?: string
  ): Promise<ScanResult> {
    const elementsSummary = elements
      .slice(0, 100) // 限制數量避免 prompt 過長
      .map((el, i) => {
        const parts = [`${i + 1}. <${el.tag}>`];
        if (el.type) parts.push(`type="${el.type}"`);
        if (el.text) parts.push(`text="${el.text.slice(0, 50)}"`);
        if (el.placeholder) parts.push(`placeholder="${el.placeholder}"`);
        if (el.role) parts.push(`role="${el.role}"`);
        if (el.name) parts.push(`name="${el.name}"`);
        parts.push(`selector="${el.selector}"`);
        return parts.join(' ');
      })
      .join('\n');

    let prompt = `你是一個專業的前端測試工程師。請分析以下網頁截圖和可互動元件列表，產出完整的測試計畫。

## 頁面資訊
- URL: ${pageInfo.url}
- 標題: ${pageInfo.title}

## 可互動元件列表
${elementsSummary}

`;

    if (specContent) {
      prompt += `## 規格書內容
${specContent.slice(0, 5000)}

請根據規格書內容，產出更精準的測試案例，確保涵蓋規格書中描述的功能。

`;
    }

    prompt += `## 要求
1. 識別頁面上的主要元件（表單、導航、按鈕等）
2. 為每個重要功能產出測試案例
3. 每個測試案例需要具體的操作步驟
4. 使用頁面上實際的 CSS selector
5. 測試案例 ID 格式：TC-001, TC-002...
6. priority 依據功能重要性決定

## 回傳格式
回傳 JSON，格式如下：
{
  "components": [
    { "name": "元件名稱", "type": "form|navigation|button|link|display|input", "selector": "CSS selector", "description": "元件描述" }
  ],
  "testPlan": [
    {
      "id": "TC-001",
      "name": "測試案例名稱",
      "category": "分類（如：表單驗證、導航、互動等）",
      "priority": "high|medium|low",
      "steps": [
        { "action": "click|fill|select|wait|assert|navigate", "target": "CSS selector", "value": "填入的值（如適用）", "description": "步驟描述" }
      ],
      "expectedResult": "預期結果描述"
    }
  ]
}`;

    const text = await callGeminiVision(prompt, screenshotBase64, 'page_scan');

    try {
      const result = JSON.parse(text);
      return {
        components: result.components || [],
        testPlan: result.testPlan || [],
      };
    } catch {
      throw new Error(`AI 回傳的 JSON 無法解析：${text.slice(0, 200)}`);
    }
  }

  /** 執行單個測試案例，回傳結果 */
  async executeTestCase(
    testCase: any,
    screenshotBase64: string,
    pageInfo: { url: string; title: string }
  ): Promise<TestCaseResult> {
    const prompt = `你是一個前端測試工程師。請根據以下測試案例和目前頁面截圖，判斷測試是否通過。

## 頁面資訊
- URL: ${pageInfo.url}
- 標題: ${pageInfo.title}

## 測試案例
- ID: ${testCase.id}
- 名稱: ${testCase.name}
- 預期結果: ${testCase.expectedResult}

## 要求
觀察截圖，判斷目前頁面狀態是否符合測試的預期結果。

## 回傳格式
回傳 JSON：
{
  "passed": true/false,
  "actualResult": "實際觀察到的結果描述"
}`;

    const text = await callGeminiVision(prompt, screenshotBase64, 'test_evaluate');

    try {
      const result = JSON.parse(text);
      return {
        passed: !!result.passed,
        actualResult: result.actualResult || '無法判斷',
      };
    } catch {
      return {
        passed: false,
        actualResult: '無法解析 AI 回傳結果',
        error: text.slice(0, 200),
      };
    }
  }
}

export const pageScannerService = new PageScannerService();
