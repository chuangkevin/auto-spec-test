'use client';

import { useState, useEffect } from 'react';
import { GitBranch, ExternalLink, Loader2, Check } from 'lucide-react';
import { api } from '@/lib/api';

interface BugItem {
  id: number;
  title: string;
  reproduce_steps: string;
  expected_result: string;
  actual_result: string;
  screenshot_path?: string;
  suggestion?: string;
  test_case_id?: string;
}

interface Props {
  bugs: BugItem[];
  repo: string; // owner/repo
  projectName: string;
  executionId: number;
}

interface Member {
  login: string;
  full_name?: string;
}

interface BatchResult {
  success: number;
  failed: number;
  issues: Array<{ bug_id: number; html_url: string }>;
  errors: Array<{ bug_id: number; error: string }>;
}

export default function GiteaBatchPush({ bugs, repo, projectName, executionId }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set(bugs.map((b) => b.id)),
  );
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [assignee, setAssignee] = useState('');
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState('');

  const [owner, repoName] = repo.split('/');

  useEffect(() => {
    setLoadingMembers(true);
    api
      .get<Member[]>(`/api/gitea/repos/${owner}/${repoName}/members`)
      .then(setMembers)
      .catch(() => {})
      .finally(() => setLoadingMembers(false));
  }, [owner, repoName]);

  const toggleId = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === bugs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(bugs.map((b) => b.id)));
    }
  };

  const handleBatchPush = async () => {
    if (selectedIds.size === 0) return;
    setPushing(true);
    setError('');
    setResult(null);
    try {
      const res = await api.post<BatchResult>('/api/gitea/issues/batch', {
        repo,
        execution_id: executionId,
        project_name: projectName,
        bug_ids: Array.from(selectedIds),
        assignee: assignee || undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : '批次推送失敗');
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="rounded-lg border border-green-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <GitBranch size={20} className="text-green-600" />
        <h2 className="text-lg font-semibold text-gray-800">批次推送到 Gitea</h2>
        <span className="ml-auto rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
          {selectedIds.size} / {bugs.length} 已選取
        </span>
      </div>

      {/* Bug 勾選列表 */}
      <div className="mb-4 max-h-64 overflow-y-auto rounded-md border border-gray-200">
        <div className="sticky top-0 flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2">
          <input
            type="checkbox"
            checked={selectedIds.size === bugs.length}
            onChange={toggleAll}
            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
          />
          <span className="text-sm font-medium text-gray-600">全選 / 取消全選</span>
        </div>
        {bugs.map((bug) => (
          <label
            key={bug.id}
            className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-4 py-2.5 last:border-b-0 hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={selectedIds.has(bug.id)}
              onChange={() => toggleId(bug.id)}
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <span className="text-sm text-gray-700">{bug.title}</span>
          </label>
        ))}
      </div>

      {/* Assignee */}
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-gray-700">
          統一指派成員
        </label>
        {loadingMembers ? (
          <div className="flex items-center gap-1 text-sm text-gray-400">
            <Loader2 size={14} className="animate-spin" />
            載入中…
          </div>
        ) : (
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            <option value="">不指派</option>
            {members.map((m) => (
              <option key={m.login} value={m.login}>
                {m.full_name ? `${m.full_name} (${m.login})` : m.login}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* 推送按鈕 */}
      <button
        type="button"
        onClick={handleBatchPush}
        disabled={pushing || selectedIds.size === 0}
        className="inline-flex items-center gap-2 rounded-md bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
      >
        {pushing ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            推送中…
          </>
        ) : (
          <>
            <GitBranch size={16} />
            批次推送到 Gitea（{selectedIds.size} 個）
          </>
        )}
      </button>

      {/* 推送結果 */}
      {result && (
        <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-green-700">
            <Check size={16} />
            推送完成：成功 {result.success} 個
            {result.failed > 0 && (
              <span className="text-red-600">，失敗 {result.failed} 個</span>
            )}
          </div>
          {result.issues.length > 0 && (
            <ul className="space-y-1">
              {result.issues.map((item) => (
                <li key={item.bug_id} className="flex items-center gap-2 text-sm text-green-700">
                  <ExternalLink size={12} />
                  <a
                    href={item.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-green-900"
                  >
                    {item.html_url}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {result.errors.length > 0 && (
            <ul className="mt-2 space-y-1">
              {result.errors.map((item) => (
                <li key={item.bug_id} className="text-sm text-red-600">
                  Bug #{item.bug_id}：{item.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
