'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Brain,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Save,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';

interface ProjectSkill {
  id: number;
  name: string;
  description: string;
  content: string;
  project_id: number;
  verified?: number;
  created_at: string;
  updated_at: string;
}

export default function ProjectSkillsPanel({ projectId }: { projectId: number }) {
  const [skills, setSkills] = useState<ProjectSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchSkills = useCallback(async () => {
    try {
      const data = await api.get<ProjectSkill[]>(`/api/skills?project_id=${projectId}`);
      setSkills(data);
    } catch {
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await api.post(`/api/projects/${projectId}/skills/regenerate`);
      await fetchSkills();
    } catch {
      // silent
    } finally {
      setRegenerating(false);
    }
  };

  const handleExpand = (skill: ProjectSkill) => {
    if (expandedId === skill.id) {
      setExpandedId(null);
    } else {
      setExpandedId(skill.id);
      setEditContent(skill.content);
    }
  };

  const handleSave = async (id: number) => {
    setSaving(true);
    try {
      await api.put(`/api/skills/${id}`, { content: editContent });
      setExpandedId(null);
      await fetchSkills();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-purple-200 bg-white">
      <div className="flex items-center gap-2 px-5 py-3">
        <Brain size={18} className="text-purple-600" />
        <span className="text-sm font-semibold text-gray-800">專案知識（AI Skills）</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-600">
            {skills.length} 個
          </span>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating}
            className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {regenerating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            重新生成知識
          </button>
        </span>
      </div>

      <div className="border-t border-purple-100 px-5 py-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
            <Loader2 size={16} className="animate-spin" />
            載入中...
          </div>
        ) : skills.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">
            尚未生成，請先上傳並解析規格書
          </p>
        ) : (
          <div className="space-y-2">
            {skills.map((skill) => (
              <div key={skill.id} className="rounded-lg border border-gray-200 overflow-hidden">
                <div
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleExpand(skill)}
                >
                  {expandedId === skill.id ? (
                    <ChevronDown size={16} className="text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-400 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                      {skill.name}
                      {skill.verified === 1 ? (
                        <span className="text-xs text-green-600">✓ 已驗證</span>
                      ) : (
                        <span className="text-xs text-amber-500">⚠ 待驗證</span>
                      )}
                    </div>
                    {skill.description && (
                      <div className="text-xs text-gray-500 truncate">{skill.description}</div>
                    )}
                  </div>
                </div>

                {expandedId === skill.id && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        內容
                      </label>
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={10}
                        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm font-mono"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleSave(skill.id)}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {saving ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Save size={14} />
                        )}
                        儲存
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedId(null)}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
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
    </div>
  );
}
