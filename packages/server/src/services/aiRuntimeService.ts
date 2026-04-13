import { GeminiClient, KeyPool, type GenerateParams, type StorageAdapter } from '@kevinsisi/ai-core';
import { getGeminiModel, getGeminiPoolState, trackUsage, updateGeminiPoolState } from './geminiKeys.js';

type RuntimeImage = { mimeType: string; data: string };

class GeminiSettingsAdapter implements StorageAdapter {
  async getKeys() {
    return getGeminiPoolState().map((item) => ({
      id: item.id,
      key: item.key,
      isActive: item.isActive,
      cooldownUntil: item.cooldownUntil,
      usageCount: item.usageCount,
    }));
  }

  async updateKey(key: { id: number; key: string; isActive: boolean; cooldownUntil: number; usageCount: number }) {
    updateGeminiPoolState({
      id: key.id,
      key: key.key,
      isActive: key.isActive,
      cooldownUntil: key.cooldownUntil,
      usageCount: key.usageCount,
    });
  }
}

const keyPool = new KeyPool(new GeminiSettingsAdapter(), {
  defaultCooldownMs: 60_000,
  authCooldownMs: 30 * 60_000,
});

const client = new GeminiClient(keyPool, { maxRetries: 2 });

interface GenerateRuntimeTextParams {
  prompt: string;
  systemInstruction?: string;
  images?: RuntimeImage[];
  callType: string;
  projectId?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export async function generateRuntimeText({
  prompt,
  systemInstruction,
  images,
  callType,
  projectId,
  maxOutputTokens,
}: GenerateRuntimeTextParams): Promise<string> {
  const params: GenerateParams = {
    model: getGeminiModel(),
    systemInstruction,
    prompt,
    maxOutputTokens,
    images: images?.map((image) => ({
      type: 'inline',
      mimeType: image.mimeType,
      data: image.data,
    })),
  };

  const response = await client.generateContent(params);

  if (response.usage) {
    trackUsage(
      'ai-core-client',
      params.model,
      callType,
      {
        promptTokenCount: response.usage.promptTokens,
        candidatesTokenCount: response.usage.completionTokens,
        totalTokenCount: response.usage.totalTokens,
      },
      projectId
    );
  }

  return response.text;
}
