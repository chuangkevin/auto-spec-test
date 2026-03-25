'use client';

import { useState, useEffect } from 'react';
import { Key, Plus, Trash2, BarChart3, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';

// ─── 型別定義 ─────────────────────────────────────────────────

interface ApiKeyItem {
  suffix: string;
  created_at: string;
  calls: number;
  tokens: number;
}

interface TokenUsage {
  today: { calls: number; tokens: number };
  week: { calls: number; tokens: number };
  month: { calls: number; tokens: number };
}

// ─── API Key 管理區 ──────────────────────────────────────────

function ApiKeySection() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [newKey, setNewKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchKeys = async () => {
    try {
      const data = await api.get<ApiKeyItem[]>('/api/settings/api-keys');
      setKeys(data);
    } catch {
      setError('無法載入 API Key 列表');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleAdd = async () => {
    if (!newKey.trim()) return;
    setAdding(true);
    setError('');
    try {
      await api.post('/api/settings/api-keys', { key: newKey.trim() });
      setNewKey('');
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : '新增失敗');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (suffix: string) => {
    setError('');
    try {
      await api.delete(`/api/settings/api-keys/${suffix}`);
      setDeleteConfirm(null);
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <Key size={20} className="text-gray-600" />
        <h2 className="text-lg font-semibold text-gray-800">API Key 管理</h2>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* 新增 Key */}
      <div className="mb-4 flex gap-2">
        <input
          type="password"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="貼上新的 API Key"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding || !newKey.trim()}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus size={16} />
          {adding ? '新增中...' : '新增'}
        </button>
      </div>

      {/* Key 列表 */}
      {loading ? (
        <p className="py-4 text-center text-sm text-gray-500">載入中...</p>
      ) : keys.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">尚未設定任何 API Key</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600">
                  Key
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600">
                  建立時間
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">
                  呼叫次數
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">
                  Token 用量
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
                  <td className="px-4 py-2.5 text-gray-500">
                    {new Date(k.created_at).toLocaleDateString('zh-TW')}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700">
                    {k.calls.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700">
                    {k.tokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {deleteConfirm === k.suffix ? (
                      <span className="flex items-center justify-end gap-2">
                        <span className="text-xs text-red-600">確定刪除？</span>
                        <button
                          type="button"
                          onClick={() => handleDelete(k.suffix)}
                          className="rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-700"
                        >
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
                        title="刪除"
                      >
                        <Trash2 size={16} />
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

// ─── Token 用量統計 ──────────────────────────────────────────

function TokenUsageSection() {
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<TokenUsage>('/api/settings/token-usage')
      .then(setUsage)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const periods = [
    { key: 'today' as const, label: '今日' },
    { key: 'week' as const, label: '本週' },
    { key: 'month' as const, label: '本月' },
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 size={20} className="text-gray-600" />
        <h2 className="text-lg font-semibold text-gray-800">Token 用量統計</h2>
      </div>

      {loading ? (
        <p className="py-4 text-center text-sm text-gray-500">載入中...</p>
      ) : !usage ? (
        <p className="py-4 text-center text-sm text-gray-500">無法載入用量資料</p>
      ) : (
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
                    {usage[key].tokens.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 設定頁主元件 ─────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">系統設定</h1>
      <ApiKeySection />
      <TokenUsageSection />
    </div>
  );
}
