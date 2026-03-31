import { getGeminiApiKey, getGeminiApiKeyExcluding, getGeminiModel, trackUsage } from './geminiKeys.js';
import { skillService } from './skillService.js';

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

/** 把 DOM tree JSON 轉成 indent 格式的可讀文字 */
function formatDomTree(node: any, indent = 0): string {
  if (!node) return '';
  const pad = '  '.repeat(indent);
  const tag = node.tag || 'unknown';

  // 組裝屬性
  const attrParts: string[] = [];
  if (node.id) attrParts.push(`id="${node.id}"`);
  if (node.class) attrParts.push(`class="${node.class}"`);
  if (node.attrs) {
    for (const [k, v] of Object.entries(node.attrs)) {
      attrParts.push(`${k}="${v}"`);
    }
  }
  if (node.selector) attrParts.push(`selector="${node.selector}"`);

  const attrStr = attrParts.length > 0 ? ' ' + attrParts.join(' ') : '';

  // 葉節點：顯示文字內容
  if (!node.children || node.children.length === 0) {
    const text = node.text ? node.text.slice(0, 40) : '';
    if (text) {
      return `${pad}<${tag}${attrStr}>${text}</${tag}>`;
    }
    return `${pad}<${tag}${attrStr}>`;
  }

  // 有子節點
  const lines: string[] = [];
  lines.push(`${pad}<${tag}${attrStr}>`);
  for (const child of node.children) {
    const childStr = formatDomTree(child, indent + 1);
    if (childStr) lines.push(childStr);
  }
  lines.push(`${pad}</${tag}>`);
  return lines.join('\n');
}

class PageScannerService {
  /** 掃描頁面，產出測試計畫 */
  async scanPage(
    screenshotBase64: string,
    elements: Array<any>,
    pageInfo: { url: string; title: string },
    specContent?: string,
    behaviors?: Array<{ selector: string; type: string; description: string }>,
    domTree?: any
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

    const domTreeFormatted = domTree ? formatDomTree(domTree) : '';

    let prompt = `你是一個資深 QA 測試工程師。請分析以下網頁截圖、可互動元件列表和 DOM 結構，產出**以使用者旅程為核心的測試計畫**。

## 頁面資訊
- URL: ${pageInfo.url}
- 標題: ${pageInfo.title}

## 當前頁面狀態判斷
觀察截圖，判斷：
- 這是什麼類型的頁面？（登入頁、首頁、列表頁、表單頁、設定頁...）
- 使用者目前是否已登入？（有使用者名稱、頭像、登出按鈕 = 已登入）
- 頁面的核心功能是什麼？

**重要：根據當前狀態產出合理的測試。如果使用者已登入，不要產出「未登入被重導」的測試。如果在登入頁，不要產出需要登入後才能操作的測試。**

## 可互動元件列表（已從 DOM 實際掃描）
${elementsSummary}

`;

    if (domTreeFormatted) {
      prompt += `## DOM 結構（從頁面實際提取）
${domTreeFormatted}

`;
    }

    prompt += `## Selector 規則（嚴格遵守）

### 優先順序（必須按此順序選擇）
1. **#id** — 用元素 id 定位（最穩定），例如 #search-input、#login-btn
2. **[data-testid="XXX"]** — 用 data-testid 屬性定位
3. **[placeholder="XXX"]** — 用 placeholder 屬性定位輸入框，例如 [placeholder="搜尋社區, 路段, 關鍵字"]
4. **[aria-label="XXX"]** 或 **[name="XXX"]** — 用語意屬性定位
5. **role=XXX[name="YYY"]** — 用 ARIA role 定位，例如 role=button[name="登入"]
6. **text="XXX"** — 用元素的**精確**可見文字定位（注意：加引號代表精確匹配）

### text selector 注意事項
- **必須用精確匹配**：寫 text="店面" 而非 text=店面（無引號會模糊匹配到「店面實價」等）
- **text 容易匹配到隱藏元素**（如下拉選單中的連結），優先用其他 selector
- 如果 text 會匹配多個元素，改用 #id、[data-testid]、或 [aria-label] 等更精確的 selector
- 對於導航列的 tab/連結，優先用上方元件列表中的 selector 而非 text

### 絕對禁止
- **禁止** button text="XXX" 或 a text="XXX"（這不是合法 selector！用 text="XXX" 或 #id 就好，不要加 tag 前綴）
- **禁止** placeholder=XXX（錯誤語法！正確寫法是 [placeholder="XXX"]，帶方括號和引號）
- **禁止** nth-of-type、nth-child 等位置型 selector
- **禁止** div > div > button 等依賴 DOM 層級的 selector
- **禁止** tag.class 組合（如 button.btn-primary）
- **禁止** 猜測或編造 DOM 中不存在的 selector
- 如果某功能在元件列表或 DOM 中找不到穩定的語意 selector，**跳過該步驟**

`;

    if (specContent) {
      // 檢查是否包含 skill 領域知識
      const hasSkills = specContent.includes('=== 領域知識');
      prompt += `## ${hasSkills ? '領域知識與額外上下文' : '額外上下文'}
${specContent.slice(0, 5000)}

${hasSkills ? '**重要：上方「領域知識」中的業務規則必須反映在測試案例中。如果領域知識提到特定流程、驗證規則、或邊界條件，你必須為其產出對應的測試案例。**\n' : ''}
`;
    }

    if (behaviors && behaviors.length > 0) {
      const behaviorsSummary = behaviors
        .filter(b => b.type !== 'no_effect')
        .map(b => `- ${b.selector} → ${b.type}: ${b.description}`)
        .join('\n');
      if (behaviorsSummary) {
        prompt += `## AI 探索行為結果（已實際點擊驗證）
${behaviorsSummary}

`;
      }
    }

    prompt += `## 測試計畫要求

### 核心原則：使用者旅程，不是元件驗證
每個測試案例必須是一個**完整的使用者操作流程**，代表一個使用者意圖。

**好的測試案例範例：**
- "正常帳密登入" → 填帳號 → 填密碼 → 點登入 → 驗證跳轉到首頁
- "搜尋商品" → 在搜尋框輸入關鍵字 → 點搜尋 → 驗證結果列表更新
- "篩選後分頁" → 選擇篩選條件 → 驗證結果 → 點下一頁 → 驗證分頁正常

**禁止的測試案例（不要產出）：**
- "驗證按鈕可見" — 廢話，看截圖就知道
- "驗證標題文字" — 沒有業務意義
- "驗證輸入框存在" — 元件存在性不需要測試
- 任何只有一個 assert 步驟的測試

### 常見功能的測試策略
- **分頁**：用 navigate 直接改 URL 參數（如 ?p=2）來測試，不需要找分頁按鈕的 selector
- **篩選器/下拉選單**：如果元件列表中有對應的 select/dropdown，用 click + 等待展開 + click 選項。如果找不到穩定 selector，用 navigate 改 URL 參數
- **搜尋框**：用 [placeholder="XXX"] 或 [name="XXX"] 定位，不要用 placeholder=XXX（語法錯誤）
- **卡片/列表項連結**：如果能在元件列表中找到 <a> 連結的 href，直接用 navigate 去該 URL 測試詳情頁

### 覆蓋率要求
- 如果上方有「AI 團隊討論紀錄」和「必須覆蓋的測試重點」，你 **必須** 為每個討論重點產出至少一個對應的測試案例，不能遺漏
- 如果討論提到某功能但 DOM 中找不到元素，產出一個 category="missing" 的案例標記

### 數量與品質
- components: 列出 5-15 個主要元件
- testPlan: 產出 **6-12 個**高品質測試案例（如果討論重點多，可以超過 10 個）
- 每個案例 **2-5 個**連續操作步驟
- 每個案例至少包含一個有業務意義的操作（click/fill/select）和一個驗證點
- description 限 15 字，expectedResult 限 30 字
- 只回傳純 JSON，不要 markdown fence

回傳 JSON：
{
  "components": [
    { "name": "名稱", "type": "form|dropdown|checkbox|link|button|input|filter|navigation|pagination", "selector": "穩定的語意 selector", "description": "簡述" }
  ],
  "testPlan": [
    {
      "id": "TC-001",
      "name": "使用者旅程名稱（動詞開頭）",
      "category": "分類（如：登入流程、搜尋功能、表單提交、導航等）",
      "priority": "high|medium|low",
      "steps": [
        { "action": "click|fill|select|wait|assert|navigate|hover|press", "target": "語意 selector（text=XXX 或 role=XXX 或 #id）", "value": "填入的值（如適用）", "description": "步驟描述" }
      ],
      "expectedResult": "預期結果描述（具體的頁面變化）"
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

  /** 執行單個測試案例（多 Agent 裁判機制） */
  async executeTestCase(
    testCase: any,
    screenshotBase64: string,
    pageInfo: { url: string; title: string },
    stepsSummary?: Array<{ action: string; target?: string; description: string; success: boolean; error?: string }>
  ): Promise<TestCaseResult> {
    // 裁判 A（嚴格 - temperature 0.1）
    const judgeA = await this.singleJudge(testCase, screenshotBase64, pageInfo, 0.1, stepsSummary);

    // 裁判 B（寬鬆 - temperature 0.5）
    const judgeB = await this.singleJudge(testCase, screenshotBase64, pageInfo, 0.5, stepsSummary);

    if (judgeA.passed === judgeB.passed) {
      // 一致 → 直接採用
      return {
        passed: judgeA.passed,
        actualResult: `[多Agent一致] ${judgeA.actualResult}`,
      };
    }

    // 分歧 → 裁判 C 仲裁
    const judgeC = await this.arbitrate(testCase, screenshotBase64, pageInfo, judgeA, judgeB, stepsSummary);
    return {
      passed: judgeC.passed,
      actualResult: `[仲裁決定] ${judgeC.actualResult}\n裁判A(嚴格): ${judgeA.passed ? 'PASS' : 'FAIL'} - ${judgeA.actualResult}\n裁判B(寬鬆): ${judgeB.passed ? 'PASS' : 'FAIL'} - ${judgeB.actualResult}`,
    };
  }

  /** 單一裁判判斷 */
  private async singleJudge(
    testCase: any,
    screenshotBase64: string,
    pageInfo: { url: string; title: string },
    temperature: number,
    stepsSummary?: Array<{ action: string; target?: string; description: string; success: boolean; error?: string }>
  ): Promise<{ passed: boolean; actualResult: string }> {
    let stepsContext = '';
    if (stepsSummary && stepsSummary.length > 0) {
      const stepsText = stepsSummary.map((s, i) =>
        `${i + 1}. ${s.action}${s.target ? ` → ${s.target}` : ''}: ${s.description} — ${s.success ? '✓ 成功' : `✗ 失敗${s.error ? `: ${s.error.slice(0, 60)}` : ''}`}`
      ).join('\n');
      stepsContext = `\n## 步驟執行記錄\n${stepsText}\n`;
    }

    // 注入 skill 領域知識供法官參考
    const judgeSkills = skillService.formatForPrompt(3, 1000);
    const skillContext = judgeSkills ? `\n## 領域知識（業務規則）\n${judgeSkills}\n\n**根據領域知識判斷：如果業務規則要求某功能存在但頁面缺少，應判定 FAIL。**` : '';

    const prompt = `你是一個資深前端測試工程師。請根據以下測試案例的**步驟執行記錄**和**最終頁面截圖**，綜合判斷測試是否通過。

## 頁面資訊
- URL: ${pageInfo.url}
- 標題: ${pageInfo.title}

## 測試案例
- ID: ${testCase.id}
- 名稱: ${testCase.name}
- 預期結果: ${testCase.expectedResult}
${stepsContext}${skillContext}

## 判斷規則
1. 如果有步驟執行失敗（selector 找不到、timeout），該步驟相關的預期結果無法驗證 → 判定 FAIL，並說明哪個步驟失敗
2. 如果所有步驟都成功，觀察截圖判斷最終頁面狀態是否符合預期
3. actualResult 必須描述**具體觀察**（如「點擊登入後跳轉至 /dashboard，顯示歡迎訊息」），不要用模糊語句（如「測試通過」「結果正確」）

## 回傳格式
回傳 JSON：
{
  "passed": true/false,
  "actualResult": "具體觀察描述（含 URL 變化、頁面內容變化等）"
}`;

    try {
      const text = await callGeminiVision(prompt, screenshotBase64, 'test_evaluate', undefined, temperature);
      const result = JSON.parse(cleanJsonText(text));
      return {
        passed: !!result.passed,
        actualResult: result.actualResult || '無法判斷',
      };
    } catch {
      return {
        passed: false,
        actualResult: '無法解析 AI 回傳結果',
      };
    }
  }

  /** 仲裁裁判：在兩個裁判分歧時做最終決定 */
  private async arbitrate(
    testCase: any,
    screenshotBase64: string,
    pageInfo: { url: string; title: string },
    judgeA: { passed: boolean; actualResult: string },
    judgeB: { passed: boolean; actualResult: string },
    stepsSummary?: Array<{ action: string; target?: string; description: string; success: boolean; error?: string }>
  ): Promise<{ passed: boolean; actualResult: string }> {
    let stepsContext = '';
    if (stepsSummary && stepsSummary.length > 0) {
      const stepsText = stepsSummary.map((s, i) =>
        `${i + 1}. ${s.action}${s.target ? ` → ${s.target}` : ''}: ${s.description} — ${s.success ? '✓' : `✗${s.error ? `: ${s.error.slice(0, 40)}` : ''}`}`
      ).join('\n');
      stepsContext = `\n## 步驟執行記錄\n${stepsText}\n`;
    }

    const prompt = `你是一個資深測試仲裁裁判。兩個測試裁判對同一個測試案例產生分歧，請你做最終判定。

## 頁面資訊
- URL: ${pageInfo.url}
- 標題: ${pageInfo.title}

## 測試案例
- ID: ${testCase.id}
- 名稱: ${testCase.name}
- 預期結果: ${testCase.expectedResult}
${stepsContext}${(() => { const sk = skillService.formatForPrompt(3, 1000); return sk ? `\n## 領域知識\n${sk}\n` : ''; })()}
## 兩位裁判的判定
裁判A（嚴格）判定：${judgeA.passed ? 'PASS' : 'FAIL'} — ${judgeA.actualResult}
裁判B（寬鬆）判定：${judgeB.passed ? 'PASS' : 'FAIL'} — ${judgeB.actualResult}

## 要求
綜合步驟執行記錄、截圖、兩位裁判的意見，做出最終判定。如果步驟有失敗，優先考慮步驟失敗的影響。

只回傳 JSON：
{ "passed": true/false, "actualResult": "仲裁理由(30字內)" }`;

    try {
      const text = await callGeminiVision(prompt, screenshotBase64, 'test_arbitrate', undefined, 0.2);
      const result = JSON.parse(cleanJsonText(text));
      return {
        passed: !!result.passed,
        actualResult: result.actualResult || '仲裁無法判斷',
      };
    } catch {
      // 仲裁失敗時，偏向嚴格裁判（保守判定）
      return {
        passed: judgeA.passed,
        actualResult: `仲裁失敗，採用嚴格裁判結果: ${judgeA.actualResult}`,
      };
    }
  }
}

export const pageScannerService = new PageScannerService();
