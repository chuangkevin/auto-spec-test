import { generateRuntimeText } from './aiRuntimeService.js';
import { SPEC_PARSE_SYSTEM_PROMPT, buildSpecParsePrompt } from '../prompts/specParse.js';
import { SCRIPT_GENERATE_SYSTEM_PROMPT, buildScriptGeneratePrompt } from '../prompts/scriptGenerate.js';
async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  callType: string,
  projectId?: number
): Promise<string> {
  return generateRuntimeText({
    prompt: userPrompt,
    systemInstruction: systemPrompt,
    callType,
    projectId: projectId != null ? String(projectId) : undefined,
  });
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

  return callGemini(SPEC_PARSE_SYSTEM_PROMPT, userPrompt, 'spec_parse', projectId);
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

  return callGemini(
    SCRIPT_GENERATE_SYSTEM_PROMPT,
    userPrompt,
    'script_generate',
    projectId
  );
}
