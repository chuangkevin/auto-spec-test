/**
 * Slack Webhook 通知服務
 * 使用 Slack Incoming Webhook + Block Kit 格式發送通知
 */
import { getDb } from '../db/connection.js';

interface SlackSettings {
  webhookUrl: string;
  notifyComplete: boolean;
  notifyError: boolean;
}

interface TestCompleteData {
  projectName: string;
  totalTests: number;
  passed: number;
  failed: number;
  duration: string;
  url?: string;
}

interface TestErrorData {
  projectName: string;
  errorMessage: string;
  testName?: string;
  url?: string;
}

/** 從 DB settings 表讀取 Slack 相關設定 */
export function getSettings(): SlackSettings {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT key, value FROM settings WHERE key IN ('slack_webhook_url', 'slack_notify_complete', 'slack_notify_error')`
    )
    .all() as Array<{ key: string; value: string }>;

  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }

  return {
    webhookUrl: map['slack_webhook_url'] || '',
    notifyComplete: map['slack_notify_complete'] === 'true',
    notifyError: map['slack_notify_error'] === 'true',
  };
}

/** 發送 Slack Webhook 訊息（Block Kit payload） */
async function postWebhook(webhookUrl: string, payload: unknown): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Slack webhook 回應錯誤 (${res.status}): ${text}`);
  }
}

/** 測試完成通知 */
export async function notifyTestComplete(data: TestCompleteData): Promise<void> {
  const settings = getSettings();
  if (!settings.webhookUrl || !settings.notifyComplete) return;

  const allPassed = data.failed === 0;
  const emoji = allPassed ? ':white_check_mark:' : ':warning:';
  const status = allPassed ? '全部通過' : `${data.failed} 項失敗`;

  const blocks: unknown[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${allPassed ? '\u2705' : '\u26a0\ufe0f'} 測試完成 — ${data.projectName}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*狀態:*\n${emoji} ${status}` },
        { type: 'mrkdwn', text: `*耗時:*\n${data.duration}` },
        { type: 'mrkdwn', text: `*通過:*\n${data.passed} / ${data.totalTests}` },
        { type: 'mrkdwn', text: `*失敗:*\n${data.failed}` },
      ],
    },
  ];

  if (data.url) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '\ud83d\udcca 查看報告', emoji: true },
          url: data.url,
        },
      ],
    });
  }

  await postWebhook(settings.webhookUrl, { blocks });
}

/** 測試失敗 / 錯誤通知 */
export async function notifyTestError(data: TestErrorData): Promise<void> {
  const settings = getSettings();
  if (!settings.webhookUrl || !settings.notifyError) return;

  const blocks: unknown[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `\u274c 測試錯誤 — ${data.projectName}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*錯誤訊息:*\n\`\`\`${data.errorMessage}\`\`\``,
      },
    },
  ];

  if (data.testName) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*測試名稱:*\n${data.testName}` },
    });
  }

  if (data.url) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '\ud83d\udd0d 查看詳情', emoji: true },
          url: data.url,
        },
      ],
    });
  }

  await postWebhook(settings.webhookUrl, { blocks });
}

/** 發送測試訊息驗證 webhook 是否可用 */
export async function sendTestMessage(webhookUrl: string): Promise<void> {
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '\ud83d\udd14 Auto Spec Test — 測試通知',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Slack Webhook 連接成功！此頻道將會收到測試執行通知。',
      },
    },
  ];

  await postWebhook(webhookUrl, { blocks });
}
