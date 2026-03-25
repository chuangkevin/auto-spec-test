'use client';

import { useState, useEffect } from 'react';
import { GitBranch, ExternalLink, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';

interface BugData {
  title: string;
  reproduce_steps: string;
  expected_result: string;
  actual_result: string;
  screenshot_path?: string;
  suggestion?: string;
  test_case_id?: string;
}

interface Props {
  bug: BugData;
  repo: string; // owner/repo
  projectName?: string;
  onPushed?: (issueUrl: string) => void;
}

interface Member {
  login: string;
  full_name?: string;
  avatar_url?: string;
}

function buildIssueBody(bug: BugData, projectName?: string): string {
  const lines: string[] = [];

  if (projectName) {
    lines.push(`**專案：** ${projectName}`, '');
  }
  if (bug.test_case_id) {
    lines.push(`**測試案例 ID：** ${bug.test_case_id}`, '');
  }

  lines.push('## 重現步驟', bug.reproduce_steps, '');
  lines.push('## 預期結果', bug.expected_result, '');
  lines.push('## 實際結果', bug.actual_result, '');

  if (bug.suggestion) {
    lines.push('## 建議修正方向', bug.suggestion, '');
  }
  if (bug.screenshot_path) {
    lines.push('## 截圖', `![screenshot](${bug.screenshot_path})`, '');
  }

  lines.push('---', '_此 Issue 由 AutoSpec 自動推送_');
  return lines.join('\n');
}

export default function GiteaPushButton({ bug, repo, projectName, onPushed }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [assignee, setAssignee] = useState('');
  const [pushing, setPushing] = useState(false);
  const [issueUrl, setIssueUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [owner, repoName] = repo.split('/');

  useEffect(() => {
    if (!expanded || members.length > 0) return;
    setLoadingMembers(true);
    api
      .get<Member[]>(`/api/gitea/repos/${owner}/${repoName}/members`)
      .then(setMembers)
      .catch(() => {})
      .finally(() => setLoadingMembers(false));
  }, [expanded, owner, repoName, members.length]);

  const handlePush = async () => {
    setPushing(true);
    setError('');
    try {
      const body = buildIssueBody(bug, projectName);
      const res = await api.post<{ html_url: string }>(
        `/api/gitea/repos/${owner}/${repoName}/issues`,
        {
          title: bug.title,
          body,
          assignee: assignee || undefined,
        },
      );
      setIssueUrl(res.html_url);
      onPushed?.(res.html_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '推送失敗');
    } finally {
      setPushing(false);
    }
  };

  if (issueUrl) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-1.5 text-sm text-green-700">
        <GitBranch size={14} />
        <span>已推送</span>
        <a
          href={issueUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-green-700 underline hover:text-green-900"
        >
          查看 Issue <ExternalLink size={12} />
        </a>
      </div>
    );
  }

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1.5 rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors"
      >
        <GitBranch size={14} />
        推送到 Gitea
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div className="mt-2 w-96 rounded-lg border border-green-200 bg-white p-4 shadow-lg">
          {/* Issue 預覽 */}
          <div className="mb-3">
            <h4 className="mb-1 text-xs font-semibold text-gray-500 uppercase">Issue 預覽</h4>
            <div className="rounded-md bg-gray-50 border border-gray-200 p-3 text-sm">
              <p className="font-medium text-gray-800 mb-1">{bug.title}</p>
              <p className="text-xs text-gray-500 line-clamp-3 whitespace-pre-line">
                {buildIssueBody(bug, projectName).slice(0, 200)}...
              </p>
            </div>
          </div>

          {/* Assignee 選擇 */}
          <div className="mb-3">
            <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase">
              指派成員
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
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
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
            <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handlePush}
            disabled={pushing}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {pushing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                推送中…
              </>
            ) : (
              <>
                <GitBranch size={14} />
                推送到 Gitea
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
