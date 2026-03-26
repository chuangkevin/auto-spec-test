import { getGeminiApiKey, getGeminiApiKeyExcluding, getGeminiModel, trackUsage } from './geminiKeys.js';

const MAX_RETRIES = 2;

/** 清理 Gemini 回傳的文字，去除 markdown code fence 等 */
function cleanJsonText(text: string): string {
  let cleaned = text.trim();
  // 去除 ```json ... ``` 包裝
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return cleaned.trim();
}
const RETRY_DELAY_MS = 3000;

interface ComponentInfo {
  name: string;
  type: string; // form, navigation, button, link, etc.
  selector: string;
  description: string;
}

interface TestStep {
  action: 'click' | 'fill' | 'select' | 'wait' | 'assert' | 'navigate' | 'hover' | 'press';
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
  projectId?: string,
  temperature?: number
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
          temperature: temperature ?? 0.2,
          maxOutputTokens: 32768,
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

      // Debug: log finish reason
      const finishReason = json.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        console.warn(`[pageScannerService] finishReason: ${finishReason}, tokens used: ${JSON.stringify(json.usageMetadata)}`);
      }

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
    specContent?: string,
    behaviors?: Array<{ selector: string; type: string; description: string }>
  ): Promise<ScanResult> {
    const elementsSummary = elements
      .slice(0, 80) // 掃描更多元素
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

    let prompt = `你是一個專業的前端測試工程師。請分析以下網頁截圖和可互動元件列表，產出測試計畫。

## 頁面資訊
- URL: ${pageInfo.url}
- 標題: ${pageInfo.title}

## 可互動元件列表（已從 DOM 實際掃描）
${elementsSummary}

## 最重要規則
**你只能使用上方「可互動元件列表」中提供的 selector。絕對不要自己猜 selector 或編造不存在的 selector。**
如果某個功能在元件列表中找不到對應的 selector，就不要為它建立測試案例。

`;

    if (specContent) {
      prompt += `## 規格書內容
${specContent.slice(0, 5000)}

請根據規格書內容，產出更精準的測試案例，確保涵蓋規格書中描述的功能。

`;
    }

    if (behaviors && behaviors.length > 0) {
      const behaviorsSummary = behaviors
        .filter(b => b.type !== 'no_effect')
        .map(b => `- ${b.selector} → ${b.type}: ${b.description}`)
        .join('\n');
      if (behaviorsSummary) {
        prompt += `## AI 探索行為結果（已實際點擊驗證）
以下是 AI 自動探索各元素後觀察到的實際行為，請據此規劃更精準的測試案例：
${behaviorsSummary}

注意：
- toggle 類型的元素需要測試「點擊一次」和「再次點擊恢復」兩種狀態
- navigation 類型的元素需要驗證導航目標是否正確
- modal 類型的元素需要測試開啟和關閉
- dropdown 類型的元素需要測試展開、選擇和收合

`;
      }
    }

    prompt += `## 要求
- 仔細分析截圖（包括全頁），找出所有可互動元件
- components: 列出 10-20 個主要元件
- testPlan: 產出 12-18 個測試案例，涵蓋不同功能區域

## 必須檢查的 UI 模式（如果頁面中存在）
1. **輪播/Carousel** — 左右箭頭可點選的圖片或卡片區域
2. **下拉篩選器** — 點擊展開的 checkbox 列表或選項
3. **進階篩選** — 展開後有多組 checkbox + 範圍輸入（最低-最高）
4. **Tab 切換** — 頁面中的分頁標籤（如：全部/熱門/最新）
5. **排序選單** — 排序方式的下拉選單
6. **分頁** — 底部頁碼導航，URL 會帶分頁參數
7. **側邊欄連結** — 右側邊欄的人員卡片或推薦連結，點擊會開新頁
8. **穿插廣告** — 列表中穿插的廣告區塊，確認不影響功能
9. **搜尋框** — 關鍵字輸入 + 搜尋按鈕
- steps: 每個案例 2-4 個步驟
- description 限 15 字，expectedResult 限 25 字
- 只回傳純 JSON，不要 markdown fence
- 特別注意：下拉選單篩選、搜尋功能、分頁、排序、連結導航

回傳 JSON：
{
  "components": [
    { "name": "名稱", "type": "form|dropdown|checkbox|link|button|input|filter|navigation|pagination", "selector": "CSS", "description": "簡述" }
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
    const cleaned = cleanJsonText(text);

    try {
      const result = JSON.parse(cleaned);
      return {
        components: result.components || [],
        testPlan: result.testPlan || [],
      };
    } catch {
      // 嘗試修復不完整的 JSON（截斷的情況）
      try {
        const lastBrace = cleaned.lastIndexOf('}');
        if (lastBrace === -1) throw new Error('no brace');
        const trimmed = cleaned.slice(0, lastBrace + 1);
        // 嘗試補上缺少的結束符
        let fixed = trimmed;
        const openBrackets = (fixed.match(/\[/g) || []).length;
        const closeBrackets = (fixed.match(/\]/g) || []).length;
        for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += ']';
        const openBraces = (fixed.match(/\{/g) || []).length;
        const closeBraces = (fixed.match(/\}/g) || []).length;
        for (let i = 0; i < openBraces - closeBraces; i++) fixed += '}';
        const result2 = JSON.parse(fixed);
        return {
          components: result2.components || [],
          testPlan: result2.testPlan || [],
        };
      } catch {
        throw new Error(`AI JSON 解析失敗 (len=${cleaned.length}, last50=${cleaned.slice(-50)})`);
      }
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
      const result = JSON.parse(cleanJsonText(text));
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
