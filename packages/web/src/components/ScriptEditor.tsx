'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Save,
  Download,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  FileText,
  FormInput,
  History,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { TestScript } from '@/types';
import {
  parseScriptMd,
  serializeToMd,
  type ParsedScript,
  type TestCase,
} from '@/lib/scriptParser';

interface ScriptEditorProps {
  projectId: number;
  scriptId: number;
  initialContent: string;
}

const CATEGORIES = [
  { value: 'functional', label: '功能測試' },
  { value: 'ui', label: 'UI 測試' },
  { value: 'boundary', label: '邊界測試' },
  { value: 'security', label: '安全測試' },
];

const PRIORITIES = [
  { value: 'P0', label: 'P0（最高）' },
  { value: 'P1', label: 'P1（高）' },
  { value: 'P2', label: 'P2（一般）' },
];

function generateNextId(testCases: TestCase[]): string {
  if (testCases.length === 0) return 'TC-001';
  const nums = testCases
    .map((tc) => {
      const m = tc.id.match(/TC-(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0);
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `TC-${String(max + 1).padStart(3, '0')}`;
}

// ─── TestCase 卡片 ───────────────────────────────────────────

interface TestCaseCardProps {
  tc: TestCase;
  onChange: (tc: TestCase) => void;
  onDelete: () => void;
}

function TestCaseCard({ tc, onChange, onDelete }: TestCaseCardProps) {
  const [expanded, setExpanded] = useState(true);

  const updateField = <K extends keyof TestCase>(key: K, value: TestCase[K]) => {
    onChange({ ...tc, [key]: value });
  };

  const updateStep = (idx: number, value: string) => {
    const steps = [...tc.steps];
    steps[idx] = value;
    updateField('steps', steps);
  };

  const addStep = () => updateField('steps', [...tc.steps, '']);

  const removeStep = (idx: number) => {
    updateField('steps', tc.steps.filter((_, i) => i !== idx));
  };

  const updateVP = (idx: number, value: string) => {
    const vps = [...tc.verificationPoints];
    vps[idx] = value;
    updateField('verificationPoints', vps);
  };

  const addVP = () => updateField('verificationPoints', [...tc.verificationPoints, '']);

  const removeVP = (idx: number) => {
    updateField('verificationPoints', tc.verificationPoints.filter((_, i) => i !== idx));
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* 卡片標頭 */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <button
          type="button"
          className="flex items-center gap-2 text-left font-medium text-gray-800"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
            {tc.id}
          </span>
          <span>{tc.name || '（未命名）'}</span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
          title="刪除此測試案例"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* 卡片內容 */}
      {expanded && (
        <div className="space-y-4 p-4">
          {/* 基本資訊 */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">ID</label>
              <input
                type="text"
                value={tc.id}
                onChange={(e) => updateField('id', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">名稱</label>
              <input
                type="text"
                value={tc.name}
                onChange={(e) => updateField('name', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">分類</label>
              <select
                value={tc.category}
                onChange={(e) => updateField('category', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">請選擇</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">優先級</label>
              <select
                value={tc.priority}
                onChange={(e) => updateField('priority', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">請選擇</option>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 前置條件 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">前置條件</label>
            <input
              type="text"
              value={tc.precondition || ''}
              onChange={(e) => updateField('precondition', e.target.value || undefined)}
              placeholder="（選填）"
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* 測試步驟 */}
          <div>
            <label className="mb-2 block text-xs font-medium text-gray-500">測試步驟</label>
            <div className="space-y-2">
              {tc.steps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="mt-1.5 flex-shrink-0 text-xs font-medium text-gray-400">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={step}
                    onChange={(e) => updateStep(idx, e.target.value)}
                    className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeStep(idx)}
                    className="mt-1 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addStep}
              className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            >
              <Plus size={14} /> 新增步驟
            </button>
          </div>

          {/* 預期結果 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">預期結果</label>
            <textarea
              value={tc.expectedResult}
              onChange={(e) => updateField('expectedResult', e.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* 驗證點 */}
          <div>
            <label className="mb-2 block text-xs font-medium text-gray-500">驗證點</label>
            <div className="space-y-2">
              {tc.verificationPoints.map((vp, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="mt-1.5 flex-shrink-0 text-xs text-gray-400">☐</span>
                  <input
                    type="text"
                    value={vp}
                    onChange={(e) => updateVP(idx, e.target.value)}
                    className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeVP(idx)}
                    className="mt-1 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addVP}
              className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            >
              <Plus size={14} /> 新增驗證點
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 主編輯器 ────────────────────────────────────────────────

export default function ScriptEditor({
  projectId,
  scriptId,
  initialContent,
}: ScriptEditorProps) {
  const [mode, setMode] = useState<'markdown' | 'form'>('markdown');
  const [markdown, setMarkdown] = useState(initialContent);
  const [parsed, setParsed] = useState<ParsedScript>(() => parseScriptMd(initialContent));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [versions, setVersions] = useState<TestScript[]>([]);
  const [showVersions, setShowVersions] = useState(false);

  // 載入版本歷史
  useEffect(() => {
    api
      .get<TestScript[]>(`/api/projects/${projectId}/test-scripts`)
      .then(setVersions)
      .catch(() => {});
  }, [projectId]);

  // 切換模式時同步
  const switchMode = useCallback(
    (newMode: 'markdown' | 'form') => {
      if (newMode === mode) return;
      if (newMode === 'form') {
        // Markdown → 表單
        setParsed(parseScriptMd(markdown));
      } else {
        // 表單 → Markdown
        setMarkdown(serializeToMd(parsed));
      }
      setMode(newMode);
    },
    [mode, markdown, parsed],
  );

  // 表單模式更新 TestCase
  const updateTestCase = (index: number, updated: TestCase) => {
    const newCases = [...parsed.testCases];
    newCases[index] = updated;
    setParsed({ ...parsed, testCases: newCases });
  };

  const deleteTestCase = (index: number) => {
    if (!confirm('確定要刪除此測試案例嗎？')) return;
    const newCases = parsed.testCases.filter((_, i) => i !== index);
    setParsed({ ...parsed, testCases: newCases });
  };

  const addTestCase = () => {
    const newTc: TestCase = {
      id: generateNextId(parsed.testCases),
      name: '',
      category: 'functional',
      priority: 'P1',
      steps: [''],
      expectedResult: '',
      verificationPoints: [],
    };
    setParsed({ ...parsed, testCases: [...parsed.testCases, newTc] });
  };

  // 儲存
  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const content = mode === 'markdown' ? markdown : serializeToMd(parsed);
      await api.put(`/api/projects/${projectId}/test-scripts/${scriptId}`, {
        content_md: content,
      });
      setSaveMsg('儲存成功');
      // 重新載入版本歷史
      const updated = await api.get<TestScript[]>(
        `/api/projects/${projectId}/test-scripts`,
      );
      setVersions(updated);
    } catch (err) {
      setSaveMsg(`儲存失敗：${err instanceof Error ? err.message : '未知錯誤'}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 3000);
    }
  };

  // 下載 .md
  const handleDownload = () => {
    const content = mode === 'markdown' ? markdown : serializeToMd(parsed);
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-script-${scriptId}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* 工具列 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 模式切換 Tab */}
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => switchMode('markdown')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === 'markdown'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <FileText size={15} />
            Markdown 模式
          </button>
          <button
            type="button"
            onClick={() => switchMode('form')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === 'form'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <FormInput size={15} />
            表單模式
          </button>
        </div>

        {/* 動作按鈕 */}
        <div className="flex items-center gap-2">
          {saveMsg && (
            <span
              className={`text-sm ${
                saveMsg.startsWith('儲存成功') ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {saveMsg}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowVersions(!showVersions)}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <History size={15} />
            版本歷史
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Download size={15} />
            下載 .md
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={15} />
            {saving ? '儲存中...' : '儲存'}
          </button>
        </div>
      </div>

      {/* 版本歷史面板 */}
      {showVersions && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">版本歷史</h3>
          {versions.length === 0 ? (
            <p className="text-sm text-gray-500">暫無版本記錄</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="font-medium text-gray-700">
                    v{v.version}
                  </span>
                  <span className="text-gray-500">
                    {new Date(v.created_at).toLocaleString('zh-TW')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 編輯區 */}
      {mode === 'markdown' ? (
        <textarea
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          className="min-h-[600px] w-full rounded-lg border border-gray-200 bg-white p-4 font-mono text-sm leading-relaxed text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="在此輸入 Markdown 格式的測試腳本..."
        />
      ) : (
        <div className="space-y-4">
          {/* 腳本標題 */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <label className="mb-1 block text-xs font-medium text-gray-500">
              腳本標題
            </label>
            <input
              type="text"
              value={parsed.title}
              onChange={(e) => setParsed({ ...parsed, title: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* 測試案例卡片 */}
          {parsed.testCases.map((tc, idx) => (
            <TestCaseCard
              key={tc.id + '-' + idx}
              tc={tc}
              onChange={(updated) => updateTestCase(idx, updated)}
              onDelete={() => deleteTestCase(idx)}
            />
          ))}

          {/* 新增按鈕 */}
          <button
            type="button"
            onClick={addTestCase}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-white py-4 text-sm font-medium text-gray-500 transition-colors hover:border-blue-400 hover:text-blue-600"
          >
            <Plus size={18} />
            新增測試案例
          </button>
        </div>
      )}
    </div>
  );
}
