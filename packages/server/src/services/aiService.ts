import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry as aiCoreWithRetry, NoAvailableKeyError } from '@kevinsisi/ai-core';
import { getGeminiApiKey, getGeminiApiKeyExcluding, trackUsage } from './geminiKeys.js';
import { SPEC_PARSE_SYSTEM_PROMPT, buildSpecParsePrompt } from '../prompts/specParse.js';
import { SCRIPT_GENERATE_SYSTEM_PROMPT, buildScriptGeneratePrompt } from '../prompts/scriptGenerate.js';

const MAX_RETRIES = 2;

function getModelName(): string {
  return process.env.GEMINI_MODEL || 'gemini-2.5-flash';
}

async function withRetry<T>(
  fn: (apiKey: string) => Promise<T>,
  _callType: string,
  _projectId?: number
): Promise<T> {
  const firstKey = getGeminiApiKey();
  if (!firstKey) {
    throw new Error('沒有可用的 Gemini API Key，請在系統設定中新增。');
  }

  return aiCoreWithRetry(fn, firstKey, {
    maxRetries: MAX_RETRIES,
    rotateKey: async () => {
      const nextKey = getGeminiApiKeyExcluding(firstKey);
      if (!nextKey) throw new NoAvailableKeyError();
      return nextKey;
    },
  });
}

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  callType: string,
  projectId?: number
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: getModelName(),
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent(userPrompt);
  const response = result.response;
  const text = response.text();

  // Track token usage
  const usage = response.usageMetadata;
  if (usage) {
    trackUsage(apiKey, getModelName(), callType, usage, projectId != null ? String(projectId) : undefined);
  }

  return text;
}

/**
 * 解析規格書：將原始文字轉為結構化大綱
 */
export async function parseSpecification(
  rawText: string,
  projectId?: number
): Promise<string> {
  if (!rawText.trim()) {
    throw new Error('規格書內容為空，無法解析。');
  }

  const userPrompt = buildSpecParsePrompt(rawText);

  return withRetry(
    (apiKey) =>
      callGemini(apiKey, SPEC_PARSE_SYSTEM_PROMPT, userPrompt, 'spec_parse', projectId),
    'spec_parse',
    projectId
  );
}

/**
 * 產出測試腳本：根據規格大綱產出測試腳本
 */
export async function generateTestScript(
  outlineMd: string,
  productName: string,
  projectId?: number
): Promise<string> {
  if (!outlineMd.trim()) {
    throw new Error('規格大綱為空，無法產出測試腳本。');
  }

  const userPrompt = buildScriptGeneratePrompt(outlineMd, productName);

  return withRetry(
    (apiKey) =>
      callGemini(
        apiKey,
        SCRIPT_GENERATE_SYSTEM_PROMPT,
        userPrompt,
        'script_generate',
        projectId
      ),
    'script_generate',
    projectId
  );
}
