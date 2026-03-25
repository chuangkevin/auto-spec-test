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
      const data = await api.get<{
        project: Project;
        specification?: Specification;
        test_script?: TestScript;
      }>(`/api/projects/${projectId}`);
      setProject(data.project);
      setSpec(data.specification ?? null);
      setTestScript(data.test_script ?? null);
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
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[project.status]}`}
          >
            {STATUS_LABELS[project.status]}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
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
