'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  FileText,
  Play,
  ClipboardList,
  Loader2,
  AlertCircle,
  GitBranch,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Check,
  Settings,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Project, Specification, TestScript } from '@/types';
import SpecUploader from '@/components/SpecUploader';
import OutlinePreview from '@/components/OutlinePreview';
import ScriptEditor from '@/components/ScriptEditor';

const STATUS_LABELS: Record<Project['status'], string> = {
  draft: '草稿',
  has_script: '已產出腳本',
  testing: '測試中',
  completed: '已完成',
};

const STATUS_COLORS: Record<Project['status'], string> = {
  draft: 'bg-gray-100 text-gray-700',
  has_script: 'bg-blue-100 text-blue-700',
  testing: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-700',
};

type Tab = 'scripts' | 'testing' | 'reports';

// --- Gitea 型別 ---

interface GiteaStatus {
  connected: boolean;
  username?: string;
}

interface GiteaOrg {
  username: string;
  full_name: string;
  avatar_url: string;
}

interface GiteaRepo {
  full_name: string;
  name: string;
  description?: string;
}

interface GiteaProject {
  id: number;
  title: string;
  description: string;
}

// --- 建立 Repo 內嵌元件 ---

function CreateRepoInline({ org, onCreated }: { org: string; onCreated: (repo: { full_name: string; name: string }) => void }) {
  const [repoName, setRepoName] = useState('test-issues');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!repoName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await api.post<{ full_name: string; name: string; html_url: string }>(
        `/api/gitea/orgs/${encodeURIComponent(org)}/repos`,
        { name: repoName.trim(), description: '測試 Issues 專用 Repository（Auto Spec Test 建立）' }
      );
      onCreated({ full_name: res.full_name, name: res.name });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '建立失敗');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="rounded-md border border-dashed border-yellow-300 bg-yellow-50 p-3 space-y-2">
      <p className="text-sm text-yellow-700">此 Organization 尚無 Repository，需要建立一個來存放測試 Issues。</p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={repoName}
          onChange={(e) => setRepoName(e.target.value)}
          placeholder="Repository 名稱"
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating || !repoName.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          建立
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// --- Gitea 設定區塊 ---

function GiteaSettingsSection({
  project,
  onSaved,
}: {
  project: Project;
  onSaved: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [giteaConnected, setGiteaConnected] = useState(false);
  const [checkingGitea, setCheckingGitea] = useState(true);

  // 下拉選項
  const [orgs, setOrgs] = useState<GiteaOrg[]>([]);
  const [repos, setRepos] = useState<GiteaRepo[]>([]);
  const [projects, setProjects] = useState<GiteaProject[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // 選取值
  const [selectedOrg, setSelectedOrg] = useState(project.gitea_org || '');
  const [selectedRepo, setSelectedRepo] = useState(project.gitea_repo || '');
  const [selectedProjectId, setSelectedProjectId] = useState<number | string>(
    project.gitea_project_id || '',
  );

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError] = useState('');

  // 檢查 Gitea 連接狀態
  useEffect(() => {
    api
      .get<GiteaStatus>('/api/gitea/status')
      .then((data) => {
        setGiteaConnected(data.connected);
        if (data.connected) {
          // 載入 organizations
          setLoadingOrgs(true);
          api
            .get<GiteaOrg[]>('/api/gitea/orgs')
            .then(setOrgs)
            .catch(() => {})
            .finally(() => setLoadingOrgs(false));
        }
      })
      .catch(() => {})
      .finally(() => setCheckingGitea(false));
  }, []);

  // 選擇 org 後載入 repos 和 projects
  useEffect(() => {
    if (!selectedOrg) {
      setRepos([]);
      setProjects([]);
      return;
    }

    setLoadingRepos(true);
    api
      .get<GiteaRepo[]>(`/api/gitea/orgs/${encodeURIComponent(selectedOrg)}/repos`)
      .then(setRepos)
      .catch(() => setRepos([]))
      .finally(() => setLoadingRepos(false));

    setLoadingProjects(true);
    api
      .get<GiteaProject[]>(`/api/gitea/orgs/${encodeURIComponent(selectedOrg)}/projects`)
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, [selectedOrg]);

  // 如果 project 已有 org 設定，自動展開
  useEffect(() => {
    if (project.gitea_org) {
      setExpanded(true);
    }
  }, [project.gitea_org]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaveMsg('');
    try {
      await api.put(`/api/projects/${project.id}`, {
        gitea_org: selectedOrg || undefined,
        gitea_repo: selectedRepo || undefined,
        gitea_project_id: selectedProjectId ? Number(selectedProjectId) : undefined,
      });
      setSaveMsg('Gitea 設定已儲存');
      onSaved();
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const hasGiteaConfig = project.gitea_org || project.gitea_repo;

  return (
    <div className="rounded-lg border border-green-200 bg-white">
      {/* 標題列（可收合） */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-5 py-3 text-left hover:bg-green-50 transition-colors rounded-t-lg"
      >
        <GitBranch size={18} className="text-green-600" />
        <span className="text-sm font-semibold text-gray-800">Gitea 設定</span>
        {hasGiteaConfig && (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-xs font-medium text-green-700">
            <Check size={10} />
            {project.gitea_org}/{project.gitea_repo?.split('/').pop() || ''}
          </span>
        )}
        <span className="ml-auto">
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-green-100 px-5 py-4 space-y-4">
          {checkingGitea ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 size={14} className="animate-spin" />
              檢查 Gitea 連接狀態...
            </div>
          ) : !giteaConnected ? (
            <div className="rounded-md bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-700">
              請先到{' '}
              <Link href="/settings" className="font-medium text-green-600 hover:text-green-800 underline">
                系統設定
              </Link>{' '}
              連接 Gitea
            </div>
          ) : (
            <>
              {error && (
                <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
              {saveMsg && (
                <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                  <Check size={14} />
                  {saveMsg}
                </div>
              )}

              {/* Organization 下拉 */}
              <div>
                <label htmlFor="gitea-org-select" className="mb-1 block text-sm font-medium text-gray-700">
                  Organization
                </label>
                {loadingOrgs ? (
                  <div className="flex items-center gap-1 text-sm text-gray-400">
                    <Loader2 size={14} className="animate-spin" />
                    載入中...
                  </div>
                ) : (
                  <select
                    id="gitea-org-select"
                    value={selectedOrg}
                    onChange={(e) => {
                      setSelectedOrg(e.target.value);
                      setSelectedRepo('');
                      setSelectedProjectId('');
                    }}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  >
                    <option value="">請選擇 Organization</option>
                    {orgs.map((o) => (
                      <option key={o.username} value={o.username}>
                        {o.full_name ? `${o.full_name} (${o.username})` : o.username}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Repository 下拉 */}
              {selectedOrg && (
                <div>
                  <label htmlFor="gitea-repo-select" className="mb-1 block text-sm font-medium text-gray-700">
                    Repository
                  </label>
                  {loadingRepos ? (
                    <div className="flex items-center gap-1 text-sm text-gray-400">
                      <Loader2 size={14} className="animate-spin" />
                      載入中...
                    </div>
                  ) : repos.length === 0 ? (
                    <CreateRepoInline org={selectedOrg} onCreated={(repo) => {
                      setRepos([repo]);
                      setSelectedRepo(repo.full_name);
                    }} />
                  ) : (
                    <select
                      id="gitea-repo-select"
                      value={selectedRepo}
                      onChange={(e) => setSelectedRepo(e.target.value)}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                    >
                      <option value="">請選擇 Repository</option>
                      {repos.map((r) => (
                        <option key={r.full_name} value={r.full_name}>
                          {r.name}
                          {r.description ? ` - ${r.description}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Project Board 下拉 */}
              {selectedOrg && (
                <div>
                  <label htmlFor="gitea-project-select" className="mb-1 block text-sm font-medium text-gray-700">
                    Project Board
                    <span className="ml-1 text-xs font-normal text-gray-400">（選填）</span>
                  </label>
                  {loadingProjects ? (
                    <div className="flex items-center gap-1 text-sm text-gray-400">
                      <Loader2 size={14} className="animate-spin" />
                      載入中...
                    </div>
                  ) : projects.length === 0 ? (
                    <p className="text-sm text-gray-400">Org-level Project Board 需在 Gitea Web UI 手動管理</p>
                  ) : (
                    <select
                      id="gitea-project-select"
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                    >
                      <option value="">不綁定</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                          {p.description ? ` - ${p.description}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* 儲存按鈕 */}
              <div>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      儲存中...
                    </>
                  ) : (
                    <>
                      <Settings size={14} />
                      儲存 Gitea 設定
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// --- 主頁面 ---

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = Number(params.id);

  const [project, setProject] = useState<Project | null>(null);
  const [spec, setSpec] = useState<Specification | null>(null);
  const [testScript, setTestScript] = useState<TestScript | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('scripts');

  // Script generation
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    try {
      const projectData = await api.get<Project>(`/api/projects/${projectId}`);
      setProject(projectData);

      // Fetch latest spec
      try {
        const specs = await api.get<Specification[]>(`/api/projects/${projectId}/specifications`);
        if (specs.length > 0) setSpec(specs[0]);
      } catch { /* no specs yet */ }

      // Fetch latest test script
      try {
        const script = await api.get<TestScript>(`/api/projects/${projectId}/test-scripts/latest`);
        setTestScript(script);
      } catch { /* no scripts yet */ }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const handleUploadComplete = () => {
    fetchProject();
  };

  const handleOutlineChange = (md: string) => {
    if (spec) {
      setSpec({ ...spec, parsed_outline_md: md });
    }
  };

  const handleConfirmOutline = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await api.post<{ test_script: TestScript }>(
        `/api/projects/${projectId}/test-scripts/generate`,
      );
      setTestScript(res.test_script);
      // Refresh project to get updated status
      await fetchProject();
    } catch (err: unknown) {
      setGenError(err instanceof Error ? err.message : '產出腳本失敗');
    } finally {
      setGenerating(false);
    }
  };

  const hasScript = !!testScript;

  // Tab definitions
  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'scripts', label: '測試腳本', icon: FileText },
    { key: 'testing', label: '進行測試', icon: Play },
    { key: 'reports', label: '測試報告', icon: ClipboardList },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <AlertCircle size={32} className="mb-2" />
        <p>{error || '找不到專案'}</p>
        <Link href="/projects" className="mt-4 text-sm text-blue-600 hover:underline">
          返回專案列表
        </Link>
      </div>
    );
  }

  // Determine Tab 1 stage
  const specStage = !spec
    ? 'upload'
    : !spec.parsed_outline_md
      ? 'parse'
      : testScript
        ? 'done'
        : 'outline';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3"
        >
          <ArrowLeft size={16} />
          返回專案列表
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            {project.product_name && (
              <p className="mt-1 text-sm text-gray-500">
                產品：{project.product_name}
              </p>
            )}
            {project.description && (
              <p className="mt-1 text-sm text-gray-600">{project.description}</p>
            )}
            {project.gitea_repo && (
              <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-2.5 py-0.5 text-xs font-medium text-green-700">
                <GitBranch size={12} />
                {project.gitea_repo}
                <ExternalLink size={10} />
              </p>
            )}
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[project.status]}`}
          >
            {STATUS_LABELS[project.status]}
          </span>
        </div>
      </div>

      {/* Gitea 設定區塊（可收合） */}
      <GiteaSettingsSection project={project} onSaved={fetchProject} />

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                type="button"
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-1.5 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'scripts' && (
          <Tab1Content
            projectId={projectId}
            spec={spec}
            testScript={testScript}
            specStage={specStage}
            generating={generating}
            genError={genError}
            onUploadComplete={handleUploadComplete}
            onOutlineChange={handleOutlineChange}
            onConfirmOutline={handleConfirmOutline}
            onRefresh={fetchProject}
          />
        )}

        {activeTab === 'testing' && (
          <NoScriptGuard hasScript={hasScript}>
            <div className="rounded-md border border-gray-200 bg-white p-8 text-center text-gray-500">
              <Play size={32} className="mx-auto mb-3 text-gray-300" />
              <p>Phase 2 即將推出</p>
            </div>
          </NoScriptGuard>
        )}

        {activeTab === 'reports' && (
          <NoScriptGuard hasScript={hasScript}>
            <div className="rounded-md border border-gray-200 bg-white p-8 text-center text-gray-500">
              <ClipboardList size={32} className="mx-auto mb-3 text-gray-300" />
              <p>Phase 2 即將推出</p>
            </div>
          </NoScriptGuard>
        )}
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function NoScriptGuard({
  hasScript,
  children,
}: {
  hasScript: boolean;
  children: React.ReactNode;
}) {
  if (!hasScript) {
    return (
      <div className="rounded-md border border-yellow-200 bg-yellow-50 p-8 text-center">
        <AlertCircle size={28} className="mx-auto mb-2 text-yellow-500" />
        <p className="text-sm font-medium text-yellow-800">
          請先在「測試腳本」分頁產出測試腳本
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

function Tab1Content({
  projectId,
  spec,
  testScript,
  specStage,
  generating,
  genError,
  onUploadComplete,
  onOutlineChange,
  onConfirmOutline,
  onRefresh,
}: {
  projectId: number;
  spec: Specification | null;
  testScript: TestScript | null;
  specStage: 'upload' | 'parse' | 'outline' | 'done';
  generating: boolean;
  genError: string | null;
  onUploadComplete: () => void;
  onOutlineChange: (md: string) => void;
  onConfirmOutline: () => void;
  onRefresh: () => void;
}) {
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleParse = async () => {
    if (!spec) return;
    setParsing(true);
    setParseError(null);
    try {
      await api.post(`/api/projects/${projectId}/specifications/${spec.id}/parse`);
      await onRefresh();
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : '解析失敗');
    } finally {
      setParsing(false);
    }
  };

  // Stage 1: No specification yet
  if (specStage === 'upload') {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-base font-semibold text-gray-800">上傳規格書</h3>
        <SpecUploader projectId={projectId} onUploadComplete={onUploadComplete} />
      </div>
    );
  }

  // Stage 2: Uploaded but not parsed
  if (specStage === 'parse') {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-6 space-y-4">
        <h3 className="text-base font-semibold text-gray-800">規格書已上傳</h3>
        {spec && spec.original_files.length > 0 && (
          <ul className="space-y-1 text-sm text-gray-600">
            {spec.original_files.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <FileText size={14} className="text-gray-400" />
                {f.name}
              </li>
            ))}
          </ul>
        )}
        {parseError && <p className="text-sm text-red-600">{parseError}</p>}
        <button
          type="button"
          onClick={handleParse}
          disabled={parsing}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {parsing ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              解析中...
            </>
          ) : (
            <>
              <FileText size={16} />
              解析規格書
            </>
          )}
        </button>
      </div>
    );
  }

  // Stage 3: Parsed, showing outline
  if (specStage === 'outline' && spec) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-6 space-y-4">
        <h3 className="text-base font-semibold text-gray-800">規格書大綱</h3>
        {generating && (
          <div className="flex items-center gap-2 rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700">
            <Loader2 size={16} className="animate-spin" />
            正在產出測試腳本，請稍候...
          </div>
        )}
        {genError && <p className="text-sm text-red-600">{genError}</p>}
        <OutlinePreview
          projectId={projectId}
          specId={spec.id}
          outlineMd={spec.parsed_outline_md || ''}
          onOutlineChange={onOutlineChange}
          onConfirmOutline={onConfirmOutline}
          confirming={generating}
        />
      </div>
    );
  }

  // Stage 4: Script generated — use ScriptEditor for full editing
  if (specStage === 'done' && testScript) {
    return (
      <ScriptEditor
        projectId={projectId}
        scriptId={testScript.id}
        initialContent={testScript.content_md}
      />
    );
  }

  return null;
}
