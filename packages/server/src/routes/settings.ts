import { FastifyInstance, FastifyRequest } from 'fastify';
import {
  getKeyList,
  addApiKey,
  removeApiKey,
  getUsageStats,
  isValidKeyFormat,
  invalidateKeyCache,
} from '../services/geminiKeys.js';
import { getDb } from '../db/connection.js';
import {
  getSettings as getSlackSettings,
  sendTestMessage,
} from '../services/slackService.js';

export default async function settingsRoutes(fastify: FastifyInstance) {
  // Get API keys (masked) with usage stats
  fastify.get('/api/settings/api-keys', async () => {
    const keys = getKeyList();
    const usage = getUsageStats();
    return {
      keys: keys.map(k => ({
        suffix: k.suffix,
        todayCalls: k.todayCalls,
        todayTokens: k.todayTokens,
        totalCalls: k.totalCalls,
        totalTokens: k.totalTokens,
        fromEnv: k.fromEnv,
      })),
      usage,
    };
  });

  // Add a new API key
  fastify.post(
    '/api/settings/api-keys',
    async (request: FastifyRequest<{ Body: { apiKey: string } }>, reply) => {
      const { apiKey } = request.body as any;

      if (!apiKey || !isValidKeyFormat(apiKey)) {
        return reply.status(400).send({
          error: 'API Key 格式不正確。Gemini Key 應以 AIza 開頭，長度為 39 字元。',
        });
      }

      try {
        addApiKey(apiKey);
        return { success: true, suffix: apiKey.slice(-4) };
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  // Batch import API keys from multi-line text
  fastify.post(
    '/api/settings/api-keys/batch',
    async (request: FastifyRequest<{ Body: { text: string } }>, reply) => {
      const { text } = request.body as any;
      if (!text || typeof text !== 'string') {
        return reply.status(400).send({ error: 'Missing text field' });
      }

      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const added: string[] = [];
      const skipped: string[] = [];

      for (const line of lines) {
        // Skip label lines (start with -)
        if (line.startsWith('-')) continue;
        // Only accept lines that look like Gemini keys
        if (line.startsWith('AIza') && line.length >= 30) {
          try {
            addApiKey(line);
            added.push('...' + line.slice(-4));
          } catch {
            skipped.push('...' + line.slice(-4));
          }
        }
      }

      const keys = getKeyList();
      return { keys, added, skipped, totalAdded: added.length };
    }
  );

  // Delete an API key
  fastify.delete(
    '/api/settings/api-keys/:suffix',
    async (
      request: FastifyRequest<{ Params: { suffix: string } }>,
      reply
    ) => {
      const { suffix } = request.params;

      const removed = removeApiKey(suffix);
      if (!removed) {
        return reply.status(404).send({ error: '找不到此 API Key' });
      }

      return { success: true };
    }
  );

  // Get token usage statistics
  fastify.get('/api/settings/token-usage', async () => {
    return getUsageStats();
  });

  // Get/Set general settings
  fastify.get('/api/settings', async () => {
    const db = getDb();
    const rows = db
      .prepare('SELECT key, value FROM settings')
      .all() as Array<{ key: string; value: string }>;

    const settings: Record<string, string> = {};
    for (const row of rows) {
      // Don't expose sensitive values directly
      if (row.key.includes('api_key')) continue;
      settings[row.key] = row.value;
    }

    return settings;
  });

  // Batch update settings
  fastify.put(
    '/api/settings',
    async (
      request: FastifyRequest<{ Body: Record<string, string> }>,
      reply
    ) => {
      const db = getDb();
      const body = request.body as Record<string, string>;

      const upsert = db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      );

      const updateAll = db.transaction(() => {
        for (const [key, value] of Object.entries(body)) {
          if (key.includes('api_key')) continue; // skip sensitive keys
          if (typeof value === 'string' && value.trim()) {
            upsert.run(key, value.trim());
          }
        }
      });

      updateAll();
      return { success: true };
    }
  );

  // Update a single setting
  fastify.put(
    '/api/settings/:key',
    async (
      request: FastifyRequest<{
        Params: { key: string };
        Body: { value: string };
      }>,
      reply
    ) => {
      const db = getDb();
      const { key } = request.params;
      const { value } = request.body as any;

      // Prevent updating sensitive keys through this endpoint
      if (key.includes('api_key')) {
        return reply
          .status(400)
          .send({ error: '請使用 API Key 管理端點' });
      }

      db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      ).run(key, value);

      return { key, value };
    }
  );

  // ---- Slack 設定 ----

  // 讀取 Slack 設定
  fastify.get('/api/settings/slack', async () => {
    return getSlackSettings();
  });

  // 儲存 Slack 設定
  fastify.put(
    '/api/settings/slack',
    async (
      request: FastifyRequest<{
        Body: { webhookUrl: string; notifyComplete: boolean; notifyError: boolean };
      }>,
      reply
    ) => {
      const db = getDb();
      const { webhookUrl, notifyComplete, notifyError } = request.body as any;

      const upsert = db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      );

      const updateAll = db.transaction(() => {
        upsert.run('slack_webhook_url', (webhookUrl || '').trim());
        upsert.run('slack_notify_complete', String(!!notifyComplete));
        upsert.run('slack_notify_error', String(!!notifyError));
      });

      updateAll();
      return { success: true };
    }
  );

  // 發送測試訊息
  fastify.post(
    '/api/settings/slack/test',
    async (
      request: FastifyRequest<{ Body: { webhookUrl: string } }>,
      reply
    ) => {
      const { webhookUrl } = request.body as any;

      if (!webhookUrl || typeof webhookUrl !== 'string') {
        return reply.status(400).send({ error: '請提供 Webhook URL' });
      }

      try {
        await sendTestMessage(webhookUrl.trim());
        return { success: true };
      } catch (err: any) {
        return reply
          .status(400)
          .send({ error: err.message || '發送失敗' });
      }
    }
  );
}
