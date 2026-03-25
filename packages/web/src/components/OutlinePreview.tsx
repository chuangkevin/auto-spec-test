'use client';

import { useState } from 'react';
import { Eye, Edit, Save, Loader2, Check, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';

interface OutlinePreviewProps {
  projectId: number;
  specId: number;
  outlineMd: string;
  onOutlineChange: (md: string) => void;
  onConfirmOutline: () => void;
}

export default function OutlinePreview({
  projectId,
  specId,
  outlineMd,
  onOutlineChange,
  onConfirmOutline,
}: OutlinePreviewProps) {
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [draft, setDraft] = useState(outlineMd);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/projects/${projectId}/specifications/${specId}/outline`, {
        parsed_outline_md: draft,
      });
      onOutlineChange(draft);
      setMode('preview');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleParse = async () => {
    setParsing(true);
    setError(null);
    try {
      const res = await api.post<{ parsed_outline_md: string }>(
        `/api/projects/${projectId}/specifications/${specId}/parse`,
      );
      onOutlineChange(res.parsed_outline_md);
      setDraft(res.parsed_outline_md);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '解析失敗');
    } finally {
      setParsing(false);
    }
  };

  const renderMarkdown = (md: string) => {
    // Simple markdown-like rendering: just preserve whitespace and line breaks
    return md;
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Mode toggle */}
        <div className="inline-flex rounded-md border border-gray-300 bg-white text-sm">
          <button
            onClick={() => setMode('preview')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-l-md transition-colors ${
              mode === 'preview'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Eye size={14} />
            預覽
          </button>
          <button
            onClick={() => {
              setDraft(outlineMd);
              setMode('edit');
            }}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-r-md transition-colors ${
              mode === 'edit'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Edit size={14} />
            編輯
          </button>
        </div>

        {/* Parse button */}
        <button
          onClick={handleParse}
          disabled={parsing}
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {parsing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          {parsing ? '解析中...' : '解析規格書'}
        </button>

        {/* Save button (edit mode) */}
        {mode === 'edit' && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {saving ? '儲存中...' : '儲存'}
          </button>
        )}

        {/* Confirm outline */}
        <button
          onClick={onConfirmOutline}
          className="ml-auto inline-flex items-center gap-1 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Check size={14} />
          確認大綱，產出測試腳本
        </button>
      </div>

      {/* Error */}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Content */}
      {mode === 'preview' ? (
        <div className="min-h-[200px] rounded-md border border-gray-200 bg-white p-4">
          <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 font-sans">
            {renderMarkdown(outlineMd)}
          </pre>
        </div>
      ) : (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[300px] w-full rounded-md border border-gray-300 p-4 text-sm leading-relaxed text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      )}
    </div>
  );
}
