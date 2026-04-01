'use client';

import { useState, useEffect, useCallback } from 'react';
import { History, ChevronDown, ChevronRight, Play, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

interface TestPlanVersion {
  id: number;
  version: number;
  case_count: number;
  created_at: string;
}

interface TestPlanDetail {
  id: number;
  version: number;
  test_plan: string;
  components: string;
  case_count: number;
  created_at: string;
}

interface Props {
  projectId: number;
  onLoadVersion?: (testPlan: any[], components: any[]) => void;
}

export default function TestPlanHistory({ projectId, onLoadVersion }: Props) {
  const [versions, setVersions] = useState<TestPlanVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TestPlanDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchVersions = useCallback(async () => {
    try {
      const data = await api.get<TestPlanVersion[]>(
        `/api/projects/${projectId}/test-plans`,
      );
      setVersions(data);
    } catch {
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const handleToggle = async (v: TestPlanVersion) => {
    if (expandedId === v.id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }

    setExpandedId(v.id);
    setLoadingDetail(true);
    try {
      const data = await api.get<TestPlanDetail>(
        `/api/projects/${projectId}/test-plans/${v.id}`,
      );
      setDetail(data);
    } catch {
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleLoad = (d: TestPlanDetail) => {
    if (!onLoadVersion) return;
    try {
      const testPlan = JSON.parse(d.test_plan);
      const components = JSON.parse(d.components);
      onLoadVersion(testPlan, components);
    } catch {
      // silent
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-5 py-6">
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          載入歷史版本...
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
        <History size={18} className="text-gray-500" />
        <span className="text-sm font-semibold text-gray-800">
          測試計畫歷史
        </span>
        <span className="ml-auto rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
          {versions.length} 個版本
        </span>
      </div>

      <div className="px-5 py-4">
        {versions.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">
            尚無測試計畫歷史
          </p>
        ) : (
          <div className="space-y-2">
            {versions.map((v) => (
              <div
                key={v.id}
                className="rounded-lg border border-gray-200 overflow-hidden"
              >
                <div
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleToggle(v)}
                >
                  {expandedId === v.id ? (
                    <ChevronDown size={16} className="text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight
                      size={16}
                      className="text-gray-400 shrink-0"
                    />
                  )}
                  <span className="text-sm font-medium text-gray-800">
                    v{v.version}
                  </span>
                  <span className="text-xs text-gray-500">
                    {v.case_count} 個案例
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatDate(v.created_at)}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggle(v);
                      }}
                      className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      查看
                    </button>
                    {onLoadVersion && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (detail && detail.id === v.id) {
                            handleLoad(detail);
                          } else {
                            // fetch then load
                            api
                              .get<TestPlanDetail>(
                                `/api/projects/${projectId}/test-plans/${v.id}`,
                              )
                              .then((d) => handleLoad(d))
                              .catch(() => {});
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        <Play size={12} />
                        使用此版本
                      </button>
                    )}
                  </span>
                </div>

                {expandedId === v.id && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                    {loadingDetail ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                        <Loader2 size={14} className="animate-spin" />
                        載入中...
                      </div>
                    ) : detail && detail.id === v.id ? (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-500 mb-1">
                          測試案例
                        </p>
                        <ul className="space-y-0.5">
                          {(() => {
                            try {
                              const cases = JSON.parse(detail.test_plan);
                              if (!Array.isArray(cases)) return null;
                              return cases.map(
                                (tc: { name?: string }, i: number) => (
                                  <li
                                    key={i}
                                    className="text-xs text-gray-700 pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[7px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-gray-300"
                                  >
                                    {tc.name ?? `案例 ${i + 1}`}
                                  </li>
                                ),
                              );
                            } catch {
                              return (
                                <li className="text-xs text-gray-400">
                                  無法解析測試計畫
                                </li>
                              );
                            }
                          })()}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 py-2">
                        無法載入詳情
                      </p>
                    )}
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
