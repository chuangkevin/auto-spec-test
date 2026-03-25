'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Image as ImageIcon,
} from 'lucide-react';

/* -------- Types -------- */

export interface TestCaseStep {
  action: string;
  target?: string;
  value?: string;
  description: string;
}

export interface TestCase {
  id: string; // TC-001
  name: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  selected: boolean;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  steps: TestCaseStep[];
  expectedResult: string;
  actualResult?: string;
  screenshot?: string;
}

export interface TestTaskListProps {
  testCases: TestCase[];
  onChange: (cases: TestCase[]) => void;
  disabled?: boolean;
}

/* -------- Status icons -------- */

const STATUS_ICON: Record<TestCase['status'], string> = {
  pending: '\u26AA',   // white circle
  running: '\uD83D\uDFE1', // yellow circle
  passed: '\uD83D\uDFE2',  // green circle
  failed: '\uD83D\uDD34',  // red circle
  skipped: '\u23ED\uFE0F', // skip
};

const STATUS_LABEL: Record<TestCase['status'], string> = {
  pending: '待執行',
  running: '執行中',
  passed: '通過',
  failed: '失敗',
  skipped: '已跳過',
};

const PRIORITY_BADGE: Record<TestCase['priority'], string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
};

/* -------- Component -------- */

export default function TestTaskList({
  testCases,
  onChange,
  disabled = false,
}: TestTaskListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newExpected, setNewExpected] = useState('');

  /* ---- helpers ---- */

  const toggleSelectAll = () => {
    const allSelected = testCases.every((tc) => tc.selected);
    onChange(testCases.map((tc) => ({ ...tc, selected: !allSelected })));
  };

  const toggleSelect = (id: string) => {
    onChange(
      testCases.map((tc) =>
        tc.id === id ? { ...tc, selected: !tc.selected } : tc,
      ),
    );
  };

  const moveUp = (idx: number) => {
    if (idx <= 0) return;
    const arr = [...testCases];
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    onChange(arr);
  };

  const moveDown = (idx: number) => {
    if (idx >= testCases.length - 1) return;
    const arr = [...testCases];
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    onChange(arr);
  };

  const removeCase = (id: string) => {
    onChange(testCases.filter((tc) => tc.id !== id));
  };

  const addCase = () => {
    if (!newName.trim()) return;
    const nextNum = testCases.length + 1;
    const id = `TC-${String(nextNum).padStart(3, '0')}`;
    const newCase: TestCase = {
      id,
      name: newName.trim(),
      category: '自訂',
      priority: 'medium',
      selected: true,
      status: 'pending',
      steps: [],
      expectedResult: newExpected.trim() || '（未設定）',
    };
    onChange([...testCases, newCase]);
    setNewName('');
    setNewExpected('');
    setShowAddForm(false);
  };

  const allSelected =
    testCases.length > 0 && testCases.every((tc) => tc.selected);

  return (
    <div className="flex flex-col gap-2">
      {/* Header: select all */}
      {testCases.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            disabled={disabled}
            className="accent-blue-600"
          />
          全選 / 取消全選
        </label>
      )}

      {/* List */}
      <div className="space-y-1">
        {testCases.map((tc, idx) => {
          const isExpanded = expandedId === tc.id;
          const isFailed = tc.status === 'failed';

          return (
            <div
              key={tc.id}
              className={`rounded-md border text-sm transition-colors ${
                isFailed
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {/* Row */}
              <div className="flex items-center gap-2 px-3 py-2">
                <input
                  type="checkbox"
                  checked={tc.selected}
                  onChange={() => toggleSelect(tc.id)}
                  disabled={disabled}
                  className="accent-blue-600 shrink-0"
                />

                <span className="shrink-0 text-base leading-none" title={STATUS_LABEL[tc.status]}>
                  {STATUS_ICON[tc.status]}
                </span>

                <span className="shrink-0 font-mono text-xs text-gray-400">
                  {tc.id}
                </span>

                <button
                  type="button"
                  className="flex-1 truncate text-left text-gray-800 hover:text-blue-600"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : tc.id)
                  }
                >
                  {tc.name}
                </button>

                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_BADGE[tc.priority]}`}
                >
                  {tc.priority}
                </span>

                {/* move arrows */}
                <button
                  type="button"
                  onClick={() => moveUp(idx)}
                  disabled={disabled || idx === 0}
                  className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  title="上移"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(idx)}
                  disabled={disabled || idx === testCases.length - 1}
                  className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  title="下移"
                >
                  <ArrowDown size={14} />
                </button>

                <button
                  type="button"
                  onClick={() => removeCase(tc.id)}
                  disabled={disabled}
                  className="text-gray-400 hover:text-red-500 disabled:opacity-30"
                  title="移除"
                >
                  <Trash2 size={14} />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : tc.id)
                  }
                  className="text-gray-400 hover:text-gray-700"
                >
                  {isExpanded ? (
                    <ChevronUp size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </button>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-2 text-xs text-gray-600">
                  <p>
                    <span className="font-medium text-gray-700">類別：</span>
                    {tc.category}
                  </p>
                  <p>
                    <span className="font-medium text-gray-700">
                      預期結果：
                    </span>
                    {tc.expectedResult}
                  </p>

                  {tc.steps.length > 0 && (
                    <div>
                      <p className="font-medium text-gray-700 mb-1">步驟：</p>
                      <ol className="list-decimal list-inside space-y-0.5">
                        {tc.steps.map((s, i) => (
                          <li key={i}>
                            {s.description}
                            {s.target && (
                              <span className="ml-1 text-gray-400">
                                ({s.target})
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {isFailed && tc.actualResult && (
                    <div className="rounded bg-red-100 p-2 text-red-700">
                      <span className="font-medium">實際結果：</span>
                      {tc.actualResult}
                    </div>
                  )}

                  {tc.screenshot && (
                    <div>
                      <p className="font-medium text-gray-700 mb-1 flex items-center gap-1">
                        <ImageIcon size={12} />
                        截圖：
                      </p>
                      <img
                        src={
                          tc.screenshot.startsWith('data:')
                            ? tc.screenshot
                            : `data:image/png;base64,${tc.screenshot}`
                        }
                        alt={`${tc.id} 截圖`}
                        className="max-h-40 rounded border border-gray-200"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {testCases.length === 0 && (
        <p className="py-4 text-center text-xs text-gray-400">
          尚無測試案例，掃描頁面後將自動產生
        </p>
      )}

      {/* Add form */}
      {showAddForm ? (
        <div className="rounded-md border border-dashed border-blue-300 bg-blue-50 p-3 space-y-2">
          <input
            type="text"
            placeholder="測試案例名稱"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="預期結果（選填）"
            value={newExpected}
            onChange={(e) => setNewExpected(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addCase}
              disabled={!newName.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Plus size={12} />
              新增
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setNewName('');
                setNewExpected('');
              }}
              className="rounded-md px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          disabled={disabled}
          className="inline-flex items-center gap-1 self-start rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
        >
          <Plus size={12} />
          新增測試案例
        </button>
      )}
    </div>
  );
}
