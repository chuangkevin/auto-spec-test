'use client';

import { useState, useEffect, useMemo } from 'react';
import { Key, Plus, Trash2, Shield, Loader2, AlertTriangle, GitBranch, ExternalLink, Check, Unlink, MessageSquare, Send } from 'lucide-react';
import { api } from '@/lib/api';
import SkillManager from '@/components/SkillManager';

// --- 型別定義 ---

interface ApiKeyItem {
  suffix: string;
  todayCalls: number;
  totalCalls: number;
  totalTokens: number;
  fromEnv?: boolean;
}

interface UsagePeriod {
  calls: number;
  tokens: number;
}

interface ApiKeysResponse {
  keys: ApiKeyItem[];
  usage: {
    today: UsagePeriod;
    week: UsagePeriod;
    month: UsagePeriod;
  };
}

interface BatchImportResult {
  totalAdded: number;
  skipped: string[];
  added: string[];
}

interface GiteaStatus {
  connected: boolean;
  username?: string;
  gitea_url?: string;
}

// --- 工具函式 ---

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

/** 從多行文字中解析出看起來像 API Key 的行（忽略空行與 -label 標籤行） */
function parseKeys(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('-'));
}

// --- 批次匯入區域 ---

function ImportSection({ onImported }: { onImported: () => void }) {
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState('');

  const detectedCount = useMemo(() => parseKeys(text).length, [text]);

  const handleImport = async () => {
    const keys = parseKeys(text);
    if (keys.length === 0) return;

    setImporting(true);
    setError('');
    setResult(null);

    try {
      if (keys.length === 1) {
        await api.post('/api/settings/api-keys', { apiKey: keys[0] });
        setResult('成功匯入 1 把 Key');
      } else {
        const res = await api.post<BatchImportResult>(
          '/api/settings/api-keys/batch',
          { text },
        );
        setResult(`成功匯入 ${res.totalAdded} 把 Key` + (res.skipped.length > 0 ? `，跳過 ${res.skipped.length} 把` : ''));
      }
      setText('');
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : '匯入失敗');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <Plus size={20} className="text-gray-600" />
        <h2 className="text-lg font-semibold text-gray-800">匯入 API Key</h2>
      </div>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResult(null);
          setError('');
        }}
        placeholder={`貼上 API Key（支援批量匯入）\n\n-label（標籤行會被忽略）\nAIzaSy...\nAIzaSy...`}
        rows={6}
        className="mb-3 w-full rounded-md border border-gray-300 bg-gray-50 px-4 py-3 font-mono text-sm leading-relaxed text-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {detectedCount > 0
            ? `偵測到 ${detectedCount} 把 Key`
            : '尚未偵測到 Key'}
        </span>

        <button
          type="button"
          onClick={handleImport}
          disabled={importing || detectedCount === 0}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {importing ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              匯入中...
            </>
          ) : (
            <>
              <Plus size={16} />
              匯入
            </>
          )}
        </button>
      </div>

      {result && (
        <div className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {result}
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}
    </div>
  );
}

// --- Key 列表 ---

function KeyListSection({
  keys,
  loading,
  onDeleted,
}: {
  keys: ApiKeyItem[];
  loading: boolean;
  onDeleted: () => void;
}) {
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleDelete = async (suffix: string) => {
    setDeleting(suffix);
    setError('');
    try {
      await api.delete(`/api/settings/api-keys/${suffix}`);
      setDeleteConfirm(null);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失敗');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <Key size={20} className="text-gray-600" />
        <h2 className="text-lg font-semibold text-gray-800">API Key 列表</h2>
        <span className="ml-auto rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
          {keys.length} 把
        </span>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          載入中...
        </div>
      ) : keys.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          尚未設定任何 API Key，請在上方匯入
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600">
                  Key
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">
                  今日呼叫
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">
                  累計呼叫
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">
                  累計 Token
                </th>
                <th className="px-4 py-2.5 text-center font-medium text-gray-600">
                  來源
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {keys.map((k) => (
                <tr key={k.suffix} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-gray-700">
                    ...{k.suffix}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700">
                    {k.todayCalls.toLocaleString()}{' '}
                    <span className="text-xs text-gray-400">calls</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700">
                    {k.totalCalls.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700">
                    {formatTokens(k.totalTokens)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {k.fromEnv && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        <Shield size={12} />
                        ENV
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {deleteConfirm === k.suffix ? (
                      <span className="flex items-center justify-end gap-2">
                        <span className="text-xs text-red-600">
                          {k.fromEnv ? '確定封鎖？' : '確定刪除？'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDelete(k.suffix)}
                          disabled={deleting === k.suffix}
                          className="flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {deleting === k.suffix && (
                            <Loader2 size={12} className="animate-spin" />
                          )}
                          確定
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(null)}
                          className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-300"
                        >
                          取消
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(k.suffix)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                        title={k.fromEnv ? '封鎖' : '刪除'}
                      >
                        {k.fromEnv ? <Shield size={16} /> : <Trash2 size={16} />}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- 用量統計 ---

function UsageSection({ usage }: { usage: ApiKeysResponse['usage'] | null }) {
  const periods = [
    { key: 'today' as const, label: '今日' },
    { key: 'week' as const, label: '7 天' },
    { key: 'month' as const, label: '30 天' },
  ];

  if (!usage) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-800">用量統計</h2>

      <div className="grid gap-4 sm:grid-cols-3">
        {periods.map(({ key, label }) => (
          <div
            key={key}
            className="rounded-lg border border-gray-100 bg-gray-50 p-4"
          >
            <h3 className="mb-3 text-sm font-medium text-gray-500">{label}</h3>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-gray-500">API 呼叫</span>
                <span className="text-xl font-bold text-gray-800">
                  {usage[key].calls.toLocaleString()}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-gray-500">Tokens</span>
                <span className="text-xl font-bold text-blue-700">
                  {formatTokens(usage[key].tokens)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Gitea 整合區塊（Personal Access Token 模式） ---

function GiteaSection() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<GiteaStatus>({ connected: false });

  // 連接表單
  const [giteaUrl, setGiteaUrl] = useState('');
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchStatus = async () => {
    try {
      const data = await api.get<GiteaStatus>('/api/gitea/status');
      setStatus(data);
      if (data.gitea_url) setGiteaUrl(data.gitea_url);
    } catch {
      // 靜默處理
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleConnect = async () => {
    if (!giteaUrl.trim() || !token.trim()) {
      setError('請填入 Gitea URL 及 Personal Access Token');
      return;
    }

    setConnecting(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await api.post<{ success: boolean; username: string }>(
        '/api/gitea/connect',
        { giteaUrl: giteaUrl.trim(), token: token.trim() },
      );
      setStatus({ connected: true, username: res.username, gitea_url: giteaUrl.trim() });
      setToken('');
      setSuccessMsg('Gitea 連接成功！');
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '連接失敗');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setError('');
    try {
      await api.delete('/api/gitea/disconnect');
      setStatus({ connected: false });
      setSuccessMsg('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '斷開連接失敗');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-green-200 bg-white p-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          載入 Gitea 狀態...
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-green-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <GitBranch size={20} className="text-green-600" />
        <h2 className="text-lg font-semibold text-gray-800">Gitea 整合</h2>
      </div>

      {/* 成功提示 */}
      {successMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          <Check size={16} />
          {successMsg}
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {status.connected ? (
        /* -- 已連接狀態 -- */
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-md bg-green-50 border border-green-200 px-4 py-3">
            <Check size={18} className="text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-800">已連接 Gitea</p>
              {status.username && (
                <p className="text-sm text-green-600">
                  使用者：{status.username}
                </p>
              )}
              {status.gitea_url && (
                <a
                  href={status.gitea_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-800"
                >
                  {status.gitea_url} <ExternalLink size={10} />
                </a>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {disconnecting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                斷開中...
              </>
            ) : (
              <>
                <Unlink size={14} />
                斷開連接
              </>
            )}
          </button>
        </div>
      ) : (
        /* -- 未連接狀態 -- */
        <div className="space-y-4">
          <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
            請在 Gitea &rarr; Settings &rarr; Applications &rarr; Access Tokens 建立 Token，權限設定建議：
            <strong>issue</strong>: Read and Write、<strong>organization</strong>: Read、<strong>repository</strong>: Read and Write。
            user 權限不需要。
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Gitea URL
            </label>
            <input
              type="url"
              value={giteaUrl}
              onChange={(e) => setGiteaUrl(e.target.value)}
              placeholder="https://gitea.example.com"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <p className="mt-1 text-xs text-gray-400">只需填入根網址，例如 https://gitea.example.com（不要加路徑）</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Personal Access Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="輸入 Personal Access Token"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting || !giteaUrl.trim() || !token.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {connecting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  連接中...
                </>
              ) : (
                <>
                  <GitBranch size={14} />
                  連接 Gitea
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Slack 整合區塊 ---

function SlackSection() {
  const [loading, setLoading] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [notifyComplete, setNotifyComplete] = useState(false);
  const [notifyError, setNotifyError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<{
          webhookUrl: string;
          notifyComplete: boolean;
          notifyError: boolean;
        }>('/api/settings/slack');
        setWebhookUrl(data.webhookUrl || '');
        setNotifyComplete(data.notifyComplete);
        setNotifyError(data.notifyError);
      } catch {
        // 靜默處理
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      await api.put('/api/settings/slack', {
        webhookUrl,
        notifyComplete,
        notifyError,
      });
      setSuccessMsg('Slack 設定已儲存');
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!webhookUrl.trim()) {
      setError('請先填入 Webhook URL');
      return;
    }
    setTesting(true);
    setError('');
    setSuccessMsg('');
    try {
      await api.post('/api/settings/slack/test', { webhookUrl: webhookUrl.trim() });
      setSuccessMsg('測試訊息已發送，請檢查 Slack 頻道');
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '發送測試訊息失敗');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-purple-200 bg-white p-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          載入 Slack 設定...
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-purple-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <MessageSquare size={20} className="text-purple-600" />
        <h2 className="text-lg font-semibold text-gray-800">Slack 通知</h2>
      </div>

      {successMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          <Check size={16} />
          {successMsg}
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Webhook URL
          </label>
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/T.../B.../..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            在 Slack App 設定中建立 Incoming Webhook 取得此 URL
          </p>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={notifyComplete}
              onChange={(e) => setNotifyComplete(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-sm text-gray-700">測試完成時通知</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={notifyError}
              onChange={(e) => setNotifyError(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-sm text-gray-700">測試失敗時通知</span>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                儲存中...
              </>
            ) : (
              <>
                <Check size={14} />
                儲存設定
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !webhookUrl.trim()}
            className="inline-flex items-center gap-2 rounded-md border border-purple-300 bg-white px-4 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-50 transition-colors"
          >
            {testing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                發送中...
              </>
            ) : (
              <>
                <Send size={14} />
                發送測試訊息
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- 設定頁主元件 ---

export default function SettingsPage() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [usage, setUsage] = useState<ApiKeysResponse['usage'] | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const data = await api.get<ApiKeysResponse>('/api/settings/api-keys');
      setKeys(data.keys);
      setUsage(data.usage);
    } catch {
      // 靜默處理，各區塊自行顯示空狀態
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">系統設定</h1>
      <ImportSection onImported={fetchData} />
      <KeyListSection keys={keys} loading={loading} onDeleted={fetchData} />
      <UsageSection usage={usage} />
      <SkillManager />
      <GiteaSection />
      <SlackSection />
    </div>
  );
}
