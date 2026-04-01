'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Brain, Plus, Trash2, Loader2, AlertTriangle, Check,
  Upload, ChevronDown, ChevronRight, ToggleLeft, ToggleRight,
  Save, X,
} from 'lucide-react';
import { api } from '@/lib/api';

interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: number;
  order_index: number;
  created_at: string;
  updated_at: string;
}

interface ParsedSkill {
  name: string;
  description: string;
  content: string;
  isNew?: boolean;
}

/** 解析 SKILL.md 的 YAML frontmatter */
function parseSkillMd(text: string): ParsedSkill | null {
  const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!fmMatch) return null;

  const frontmatter = fmMatch[1];
  const content = fmMatch[2].trim();

  let name = '';
  let description = '';
  for (const line of frontmatter.split('\n')) {
    const nameMatch = line.match(/^name:\s*(.+)/);
    if (nameMatch) name = nameMatch[1].trim().replace(/^["']|["']$/g, '');
    const descMatch = line.match(/^description:\s*(.+)/);
    if (descMatch) description = descMatch[1].trim().replace(/^["']|["']$/g, '');
  }

  if (!name) return null;
  return { name, description, content };
}

export default function SkillManager() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Import state
  const [parsedFiles, setParsedFiles] = useState<ParsedSkill[]>([]);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  // Edit state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{ name: string; description: string; content: string }>({ name: '', description: '', content: '' });
  const [saving, setSaving] = useState(false);

  const fetchSkills = useCallback(async () => {
    try {
      const data = await api.get<Skill[]>('/api/skills');
      setSkills(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  // --- Toggle ---
  const handleToggle = async (id: string) => {
    try {
      await api.post(`/api/skills/${id}/toggle`);
      fetchSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失敗');
    }
  };

  // --- Delete ---
  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/api/skills/${id}`);
      fetchSkills();
      showSuccess('已刪除');
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
    }
  };

  // --- Expand / Edit ---
  const handleExpand = (skill: Skill) => {
    if (expandedId === skill.id) {
      setExpandedId(null);
    } else {
      setExpandedId(skill.id);
      setEditData({ name: skill.name, description: skill.description, content: skill.content });
    }
  };

  const handleSave = async () => {
    if (!expandedId) return;
    setSaving(true);
    try {
      await api.put(`/api/skills/${expandedId}`, editData);
      setExpandedId(null);
      fetchSkills();
      showSuccess('已儲存');
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  // --- File import ---
  const handleFiles = async (files: FileList | File[]) => {
    const parsed: ParsedSkill[] = [];
    const existingNames = new Set(skills.map(s => s.name));

    for (const file of Array.from(files)) {
      if (!file.name.endsWith('.md')) continue;
      const text = await file.text();
      const skill = parseSkillMd(text);
      if (skill) {
        skill.isNew = !existingNames.has(skill.name);
        parsed.push(skill);
      }
    }
    setParsedFiles(parsed);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  const handleImport = async () => {
    if (parsedFiles.length === 0) return;
    setImporting(true);
    setError('');
    try {
      const res = await api.post<{ imported: number; updated: number }>(
        '/api/skills/batch',
        { skills: parsedFiles.map(({ name, description, content }) => ({ name, description, content })) }
      );
      showSuccess(`匯入完成：新增 ${res.imported}，更新 ${res.updated}`);
      setParsedFiles([]);
      fetchSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : '匯入失敗');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="rounded-lg border border-orange-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <Brain size={20} className="text-orange-600" />
        <h2 className="text-lg font-semibold text-gray-800">AI Skills（領域知識）</h2>
        <span className="ml-auto rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-600">
          {skills.filter(s => s.enabled).length}/{skills.length} 啟用
        </span>
      </div>

      {successMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          <Check size={16} />{successMsg}
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle size={16} />{error}
          <button type="button" onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* --- 批次匯入區域 --- */}
      <div
        className={`mb-4 rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          dragOver ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-gray-50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Upload size={24} className="mx-auto mb-2 text-gray-400" />
        <p className="text-sm text-gray-500">
          拖拉 SKILL.md 檔案到此處，或{' '}
          <button type="button" onClick={() => fileInputRef.current?.click()} className="text-orange-600 hover:underline">
            選擇檔案
          </button>
          {' '}或{' '}
          <button type="button" onClick={() => dirInputRef.current?.click()} className="text-orange-600 hover:underline">
            選擇資料夾
          </button>
        </p>
        <p className="text-xs text-gray-400 mt-1">格式：YAML frontmatter（name, description）+ Markdown content</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <input
          ref={(el) => {
            (dirInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
            if (el) el.setAttribute('webkitdirectory', '');
          }}
          type="file"
          className="hidden"
          onChange={(e) => {
            if (!e.target.files) return;
            const mdFiles = Array.from(e.target.files).filter(f => f.name.endsWith('.md'));
            if (mdFiles.length > 0) handleFiles(mdFiles);
          }}
        />
      </div>

      {/* --- 匯入預覽 --- */}
      {parsedFiles.length > 0 && (
        <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 p-3">
          <div className="mb-2 text-sm font-medium text-orange-800">
            預覽：{parsedFiles.length} 個 Skill
          </div>
          <div className="space-y-1 mb-3">
            {parsedFiles.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                  p.isNew ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {p.isNew ? '新增' : '更新'}
                </span>
                <span className="font-medium text-gray-700">{p.name}</span>
                <span className="text-gray-400 text-xs truncate">{p.description}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleImport} disabled={importing}
              className="inline-flex items-center gap-1.5 rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50">
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              確認匯入
            </button>
            <button type="button" onClick={() => setParsedFiles([])}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
              取消
            </button>
          </div>
        </div>
      )}

      {/* --- Skill 列表 --- */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" />載入中...
        </div>
      ) : skills.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          尚未匯入任何 Skill，請拖拉 SKILL.md 檔案到上方區域
        </p>
      ) : (
        <div className="space-y-2">
          {skills.map((skill) => (
            <div key={skill.id} className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer" onClick={() => handleExpand(skill)}>
                {expandedId === skill.id ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800">{skill.name}</div>
                  {skill.description && <div className="text-xs text-gray-500 truncate">{skill.description}</div>}
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); handleToggle(skill.id); }}
                  className="shrink-0" title={skill.enabled ? '停用' : '啟用'}>
                  {skill.enabled ? <ToggleRight size={24} className="text-green-500" /> : <ToggleLeft size={24} className="text-gray-300" />}
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(skill.id); }}
                  className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500" title="刪除">
                  <Trash2 size={16} />
                </button>
              </div>

              {expandedId === skill.id && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">名稱</label>
                    <input type="text" value={editData.name} onChange={(e) => setEditData(d => ({ ...d, name: e.target.value }))}
                      className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">描述</label>
                    <input type="text" value={editData.description} onChange={(e) => setEditData(d => ({ ...d, description: e.target.value }))}
                      className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">內容（Markdown）</label>
                    <textarea value={editData.content} onChange={(e) => setEditData(d => ({ ...d, content: e.target.value }))}
                      rows={10} className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm font-mono" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleSave} disabled={saving}
                      className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      儲存
                    </button>
                    <button type="button" onClick={() => setExpandedId(null)}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
