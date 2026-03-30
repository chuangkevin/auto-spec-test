'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  Square,
  Hand,
  Loader2,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FolderPlus,
  LogIn,
  MousePointerClick,
  ArrowRightLeft,
  Maximize2,
  ChevronDown,
  ToggleLeft,
  MinusCircle,
  Eye,
} from 'lucide-react';
import { api, BASE_URL } from '@/lib/api';
import BrowserViewer from './BrowserViewer';
import TestTaskList from './TestTaskList';
import type { TestCase } from './TestTaskList';

/* -------- Types -------- */

interface Component {
  type: string;
  name: string;
  selector?: string;
  description?: string;
}

interface PageInfo {
  url: string;
  title: string;
}

interface Behavior {
  selector: string;
  type: 'toggle' | 'navigation' | 'modal' | 'dropdown' | 'form_submit' | 'no_effect';
  description: string;
}

type SessionStatus =
  | 'idle'
  | 'preview'
  | 'scanning'
  | 'exploring'
  | 'login_required'
  | 'ready'
  | 'running'
  | 'paused'
  | 'manual'
  | 'done';

export interface TestExecutionPanelProps {
  projectId: number;
  specContent?: string;
  initialUrl?: string;
}

/* -------- Helpers -------- */

function wsBaseUrl(): string {
  // Derive WS URL from BASE_URL
  try {
    const u = new URL(BASE_URL);
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${u.host}`;
  } catch {
    return BASE_URL.replace('http', 'ws');
  }
}

/* -------- Component -------- */

export default function TestExecutionPanel({
  projectId,
  specContent,
  initialUrl,
}: TestExecutionPanelProps) {
  const [url, setUrl] = useState(initialUrl || '');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [components, setComponents] = useState<Component[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [currentStep, setCurrentStep] = useState('');
  const [pageInfo, setPageInfo] = useState<PageInfo | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<number | null>(null);
  const [testRunId, setTestRunId] = useState<number | null>(null);
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [loginReason, setLoginReason] = useState<string>('');
  const [discussion, setDiscussion] = useState<Array<{ role: string; message: string }>>([]);
  const [reviewResult, setReviewResult] = useState<any>(null);
  const [existingProject, setExistingProject] = useState<{
    id: number; name: string; testRunCount: number;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  /* ---- WebSocket ---- */

  const connectWs = useCallback(
    (sid: string) => {
      const wsUrl = `${wsBaseUrl()}/ws/test/${sid}`;
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log('[WS] connected', wsUrl);
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as {
            type: string;
            data: unknown;
          };

          switch (msg.type) {
            case 'screenshot': {
              // data can be raw base64 string or { screenshot, pageInfo }
              if (typeof msg.data === 'string') {
                setScreenshot(msg.data);
              } else {
                const d = msg.data as { screenshot: string; pageInfo?: PageInfo };
                setScreenshot(d.screenshot);
                if (d.pageInfo) setPageInfo(d.pageInfo);
              }
              break;
            }
            case 'step': {
              const d = msg.data as { description: string; testCaseId?: string };
              setCurrentStep(d.description);
              if (d.testCaseId) {
                setTestCases((prev) =>
                  prev.map((tc) =>
                    tc.id === d.testCaseId
                      ? { ...tc, status: 'running' }
                      : tc,
                  ),
                );
              }
              break;
            }
            case 'result': {
              const d = msg.data as {
                testCaseId: string;
                status?: 'passed' | 'failed' | 'skipped';
                passed?: boolean;
                skipped?: boolean;
                actualResult?: string;
                screenshot?: string;
              };
              // Backend sends { passed: bool } or { status: string }
              const resultStatus: 'passed' | 'failed' | 'skipped' =
                d.status || (d.skipped ? 'skipped' : d.passed ? 'passed' : 'failed');
              setTestCases((prev) =>
                prev.map((tc) =>
                  tc.id === d.testCaseId
                    ? {
                        ...tc,
                        status: resultStatus,
                        actualResult: d.actualResult,
                        screenshot: d.screenshot ?? tc.screenshot,
                      }
                    : tc,
                ),
              );
              break;
            }
            case 'status': {
              const d = msg.data as { state?: SessionStatus; status?: SessionStatus };
              const newStatus = d.state || d.status;
              if (newStatus) {
                // 不讓 WS 覆蓋 preview/manual 狀態（使用者正在操作）
                setStatus(prev => {
                  if (prev === 'preview' || prev === 'manual') return prev;
                  return newStatus;
                });
                // 測試完成後自動觸發 AI 審核
                if (newStatus === 'done' && sessionId) {
                  api.post<any>(`/api/test-runner/${sessionId}/review`, {})
                    .then(review => setReviewResult(review))
                    .catch(() => {});
                }
              }
              break;
            }
            case 'components': {
              const d = msg.data as { components: Component[] };
              setComponents(d.components);
              break;
            }
            case 'testplan': {
              const d = msg.data as { testCases: TestCase[] };
              setTestCases(d.testCases);
              break;
            }
            case 'discussion': {
              const d = msg.data as { name: string; role: string; avatar: string; message: string };
              setDiscussion(prev => [...prev, d]);
              break;
            }
            case 'error': {
              const d = msg.data as { message: string };
              setError(d.message);
              break;
            }
          }
        } catch {
          // ignore malformed messages
        }
      };

      socket.onclose = () => {
        console.log('[WS] disconnected, reconnecting in 2s...');
        // 自動重連（除非已 idle）
        setTimeout(() => {
          if (wsRef.current === socket) {
            connectWs(sid);
          }
        }, 2000);
      };

      wsRef.current = socket;
    },
    [],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  /* ---- Actions ---- */

  const handleStartScan = async () => {
    if (!url.trim()) return;
    setError(null);
    setExistingProject(null);
    setStatus('scanning');
    setComponents([]);
    setTestCases([]);
    setBehaviors([]);
    setLoginReason('');
    setScreenshot(null);
    setCurrentStep('');
    setCreatedProjectId(null);

    // 檢查 URL 是否已有測試記錄
    if (projectId === 0) {
      try {
        const check = await api.get<{
          exists: boolean;
          project?: { id: number; name: string };
          testRunCount?: number;
        }>(`/api/test-runs/check-url?url=${encodeURIComponent(url.trim())}`);
        if (check.exists && check.project) {
          setExistingProject({
            id: check.project.id,
            name: check.project.name,
            testRunCount: check.testRunCount || 0,
          });
        }
      } catch { /* ignore */ }
    }

    try {
      // 1. Start session
      const res = await api.post<{ sessionId: string }>(
        '/api/test-runner/start',
        { url: url.trim(), projectId: existingProject?.id || projectId, specContent },
      );
      setSessionId(res.sessionId);
      connectWs(res.sessionId);

      // Fetch initial screenshot
      try {
        const ssRes = await api.get<{ screenshot: string; pageInfo: PageInfo }>(
          `/api/test-runner/${res.sessionId}/screenshot`,
        );
        setScreenshot(ssRes.screenshot);
        setPageInfo(ssRes.pageInfo);
      } catch {
        // not critical
      }

      // 停在 preview — 讓使用者決定
      setStatus('preview');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '掃描失敗');
      setStatus('idle');
    }
  };

  /** 直接開始掃描（不需要手動操作） */
  const handleDirectScan = async () => {
    if (!sessionId) return;
    try {
      await runExploreAndScan(sessionId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '掃描失敗');
      setStatus('idle');
    }
  };

  /** 進入手動操作模式 */
  const handleNeedManual = () => {
    setStatus('manual');
    setCurrentStep('請在瀏覽器中完成操作（登入、選擇帳號等），完成後點「準備好了」');
  };

  /** 手動操作完成，開始掃描 */
  const handleManualDone = async () => {
    if (!sessionId) return;
    setCurrentStep('');

    try {
      // 重新截圖（使用者操作後的畫面）
      try {
        const ssRes = await api.get<{ screenshot: string; pageInfo: PageInfo }>(
          `/api/test-runner/${sessionId}/screenshot`,
        );
        setScreenshot(ssRes.screenshot);
        setPageInfo(ssRes.pageInfo);
      } catch { /* not critical */ }

      await runExploreAndScan(sessionId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '掃描失敗');
      setStatus('idle');
    }
  };

  /** 探索 + 掃描流程（共用邏輯） */
  const runExploreAndScan = async (sid: string) => {
    // 3. Explore page behaviors
    setStatus('exploring');
    setCurrentStep('AI 正在探索頁面行為...');
    try {
      const exploreRes = await api.post<{ behaviors: Behavior[] }>(
        `/api/test-runner/${sid}/explore`,
      );
      setBehaviors(exploreRes.behaviors || []);
    } catch {
      // 探索失敗不阻斷流程
    }

    // 4. Multi-AI Discussion
    setCurrentStep('AI 團隊正在討論測試策略...');
    try {
      const discussRes = await api.post<{
        discussion: Array<{ role: string; message: string }>;
      }>(`/api/test-runner/${sid}/discuss`);
      setDiscussion(discussRes.discussion || []);
    } catch {
      // 討論失敗不阻斷
    }

    // 5. Trigger scan (with discussion context)
    setStatus('scanning');
    setCurrentStep('AI 正在產出測試計畫...');
    const scanRes = await api.post<{
      components: Component[];
      testPlan: TestCase[];
    }>(`/api/test-runner/${sid}/scan`, { url: url.trim() });

    setComponents(scanRes.components);
    setTestCases(scanRes.testPlan.map((tc) => ({ ...tc, selected: true })));
    setCurrentStep('');
    setStatus('ready');
  };

  const handleStartTest = async () => {
    if (!sessionId) return;
    setError(null);
    setStatus('running');
    // Mark selected as pending, deselected as skipped
    setTestCases((prev) =>
      prev.map((tc) =>
        tc.selected
          ? { ...tc, status: 'pending' }
          : { ...tc, status: 'skipped' },
      ),
    );

    try {
      const selectedIds = testCases.filter((tc) => tc.selected).map((tc) => tc.id);
      const execRes = await api.post<{ testRunId: number }>(`/api/test-runner/${sessionId}/execute`, {
        testCases: selectedIds,
      });
      if (execRes.testRunId) {
        setTestRunId(execRes.testRunId);
        // 啟動 polling 備案 — 每 3 秒拉截圖和結果
        const pollId = setInterval(async () => {
          try {
            // 拉截圖
            const ss = await api.get<{ screenshot: string; pageInfo: PageInfo }>(
              `/api/test-runner/${sessionId}/screenshot`
            );
            setScreenshot(ss.screenshot);
            if (ss.pageInfo) setPageInfo(ss.pageInfo);

            // 拉結果
            const results = await api.get<any[]>(
              `/api/test-runs/${execRes.testRunId}/results`
            );
            if (Array.isArray(results) && results.length > 0) {
              setTestCases(prev => prev.map(tc => {
                const r = results.find((x: any) => x.case_id === tc.id);
                if (r && r.status !== 'pending') {
                  return { ...tc, status: r.status, actualResult: r.actual_result };
                }
                return tc;
              }));
            }

            // 檢查是否完成
            const run = await api.get<{ status: string }>(`/api/test-runs/${execRes.testRunId}`);
            if (run.status === 'completed' || run.status === 'failed') {
              setStatus('done');
              clearInterval(pollId);
            }
          } catch {
            // ignore polling errors
          }
        }, 3000);
        // 60 秒後停止 polling
        setTimeout(() => clearInterval(pollId), 180000);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '執行失敗');
      setStatus('ready');
    }
  };

  const handlePause = async () => {
    if (!sessionId) return;
    try {
      await api.post(`/api/test-runner/${sessionId}/pause`);
      setStatus('paused');
    } catch { /* ignore */ }
  };

  const handleResume = async () => {
    if (!sessionId) return;
    try {
      await api.post(`/api/test-runner/${sessionId}/resume`);
      setStatus('running');
    } catch { /* ignore */ }
  };

  const handleSkip = async () => {
    if (!sessionId) return;
    try {
      await api.post(`/api/test-runner/${sessionId}/skip`);
    } catch { /* ignore */ }
  };

  const handleStop = async () => {
    if (!sessionId) return;
    try {
      await api.post(`/api/test-runner/${sessionId}/stop`);
      setStatus('done');
    } catch { /* ignore */ }
  };

  const handleManual = () => {
    setStatus('manual');
  };

  const handleResumeFromManual = async () => {
    if (!sessionId) return;
    try {
      await api.post(`/api/test-runner/${sessionId}/resume`);
      setStatus('running');
    } catch { /* ignore */ }
  };

  const handleReset = () => {
    wsRef.current?.close();
    setSessionId(null);
    setScreenshot(null);
    setStatus('idle');
    setComponents([]);
    setTestCases([]);
    setBehaviors([]);
    setLoginReason('');
    setCurrentStep('');
    setPageInfo(undefined);
    setError(null);
  };

  /** 重跑全部（保留測試案例，不重新掃描） */
  const handleRerunAll = async () => {
    if (!sessionId) return;
    setError(null);
    setStatus('running');
    setTestCases(prev => prev.map(tc => ({ ...tc, status: 'pending' as const, selected: true, actualResult: undefined, screenshot: undefined })));
    setReviewResult(null);
    try {
      const ids = testCases.map(tc => tc.id);
      const execRes = await api.post<{ testRunId: number }>(`/api/test-runner/${sessionId}/execute`, { testCases: ids });
      if (execRes.testRunId) setTestRunId(execRes.testRunId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '重跑失敗');
      setStatus('ready');
    }
  };

  /** 重跑失敗的案例 */
  const handleRerunFailed = async () => {
    if (!sessionId) return;
    const failedIds = testCases.filter(tc => tc.status === 'failed').map(tc => tc.id);
    if (failedIds.length === 0) return;
    setError(null);
    setStatus('running');
    setTestCases(prev => prev.map(tc =>
      failedIds.includes(tc.id) ? { ...tc, status: 'pending' as const, actualResult: undefined, screenshot: undefined } : tc
    ));
    setReviewResult(null);
    try {
      const execRes = await api.post<{ testRunId: number }>(`/api/test-runner/${sessionId}/execute`, { testCases: failedIds });
      if (execRes.testRunId) setTestRunId(execRes.testRunId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '重跑失敗');
      setStatus('ready');
    }
  };

  /* ---- Derived ---- */

  const totalCases = testCases.length;
  const passedCount = testCases.filter((tc) => tc.status === 'passed').length;
  const failedCount = testCases.filter((tc) => tc.status === 'failed').length;
  const skippedCount = testCases.filter((tc) => tc.status === 'skipped').length;
  const isRunningOrPaused = status === 'running' || status === 'paused';

  const handleCreateProject = async () => {
    if (createdProjectId) {
      window.location.href = `/projects/${createdProjectId}`;
      return;
    }
    setCreatingProject(true);
    try {
      // 先確保有產品
      const products = await api.get<Array<{ id: number }>>('/api/products');
      let productId: number;
      if (products.length > 0) {
        productId = products[0].id;
      } else {
        const newProduct = await api.post<{ id: number }>('/api/products', {
          name: '快速測試',
        });
        productId = newProduct.id;
      }

      // 建立專案
      const domain = url ? new URL(url).hostname : '快速測試';
      const project = await api.post<{ id: number }>('/api/projects', {
        name: `${domain} - ${new Date().toLocaleDateString('zh-TW')}`,
        product_id: productId,
        description: `由快速測試建立\n目標網址：${url}`,
      });
      setCreatedProjectId(project.id);

      // 把 test_run 綁到新專案
      if (testRunId) {
        try {
          await api.put(`/api/test-runs/${testRunId}/project`, {
            projectId: project.id,
          });
        } catch { /* not critical */ }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '建立專案失敗');
    } finally {
      setCreatingProject(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Existing project banner */}
      {existingProject && (
        <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
          <FolderPlus size={18} className="shrink-0 text-blue-600" />
          <div className="flex-1">
            <p className="font-medium text-blue-800">
              此網址已有專案：{existingProject.name}
            </p>
            <p className="text-blue-600 text-xs">
              已進行 {existingProject.testRunCount} 次測試，本次結果將加入此專案
            </p>
          </div>
          <a
            href={`/projects/${existingProject.id}`}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            前往專案
          </a>
          <a
            href={`/projects/${existingProject.id}#reports`}
            className="rounded-md border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            歷次報告
          </a>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertTriangle size={16} className="shrink-0" />
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600 text-xs"
          >
            關閉
          </button>
        </div>
      )}

      {/* URL input bar */}
      <div className="flex items-center gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleStartScan();
          }}
          placeholder="輸入目標 URL，例如 https://example.com"
          disabled={status !== 'idle'}
          className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
        />
        {status === 'idle' ? (
          <button
            type="button"
            onClick={handleStartScan}
            disabled={!url.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Search size={16} />
            開始掃描
          </button>
        ) : (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw size={16} />
            重新開始
          </button>
        )}
      </div>

      {/* Preview: 手動操作 or 直接掃描 — URL 下方、截圖上方 */}
      {status === 'preview' && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleNeedManual}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border-2 border-orange-400 bg-orange-50 px-4 py-3 text-base font-bold text-orange-700 hover:bg-orange-100"
          >
            <Hand size={20} />
            我要先手動操作（登入/選帳號）
          </button>
          <button
            type="button"
            onClick={handleDirectScan}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-base font-bold text-white hover:bg-green-700"
          >
            <Search size={20} />
            直接開始 AI 掃描
          </button>
        </div>
      )}

      {/* 手動操作中 */}
      {status === 'manual' && (
        <div className="flex items-center gap-3 rounded-lg border-2 border-orange-400 bg-orange-50 px-4 py-3">
          <Hand size={20} className="text-orange-600 animate-pulse" />
          <div className="flex-1">
            <p className="text-sm font-bold text-orange-800">手動操作中 — 點擊下方截圖操作瀏覽器</p>
            <p className="text-xs text-orange-600">截圖每秒更新</p>
          </div>
          <button
            type="button"
            onClick={handleManualDone}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-700"
          >
            <CheckCircle2 size={16} />
            操作完成，開始掃描
          </button>
        </div>
      )}

      {/* Main layout: left browser + right panel */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Left: Browser viewer (3/5) */}
        <div className="lg:col-span-3 space-y-3">
          <BrowserViewer
            screenshot={screenshot}
            currentStep={currentStep}
            status={status}
            pageInfo={pageInfo}
            sessionId={sessionId}
            interactive={status === 'manual' || status === 'preview'}
            onScreenshotUpdate={setScreenshot}
          />

          {/* Control buttons */}
          {!['idle', 'preview', 'manual'].includes(status) && (
            <div className="flex flex-wrap items-center gap-2">
              {status === 'ready' && (
                <button
                  type="button"
                  onClick={handleStartTest}
                  disabled={testCases.filter((tc) => tc.selected).length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  <Play size={16} />
                  開始測試
                </button>
              )}

              {status === 'running' && (
                <>
                  <button
                    type="button"
                    onClick={handlePause}
                    className="inline-flex items-center gap-1.5 rounded-md bg-yellow-500 px-3 py-2 text-sm font-medium text-white hover:bg-yellow-600"
                  >
                    <Pause size={16} />
                    暫停
                  </button>
                  <button
                    type="button"
                    onClick={handleSkip}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    <SkipForward size={16} />
                    跳過當前
                  </button>
                  <button
                    type="button"
                    onClick={handleStop}
                    className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    <Square size={16} />
                    終止
                  </button>
                  <button
                    type="button"
                    onClick={handleManual}
                    className="inline-flex items-center gap-1.5 rounded-md border border-orange-300 px-3 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50"
                  >
                    <Hand size={16} />
                    手動介入
                  </button>
                </>
              )}

              {status === 'paused' && (
                <>
                  <button
                    type="button"
                    onClick={handleResume}
                    className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                  >
                    <Play size={16} />
                    繼續
                  </button>
                  <button
                    type="button"
                    onClick={handleStop}
                    className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    <Square size={16} />
                    終止
                  </button>
                </>
              )}

              {status === 'manual' && (
                <div className="flex items-center gap-3 rounded-md border border-orange-300 bg-orange-50 px-4 py-2 w-full">
                  <Hand size={18} className="text-orange-500" />
                  <span className="text-sm text-orange-700">
                    您正在手動操作中，完成後點擊「繼續 AI 測試」
                  </span>
                  <button
                    type="button"
                    onClick={handleResumeFromManual}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
                  >
                    <Play size={14} />
                    繼續 AI 測試
                  </button>
                </div>
              )}

              {/* Preview 狀態：讓使用者決定要不要先手動操作 */}
              {status === 'preview' && (
                <div className="flex flex-col gap-2 w-full">
                  <div className="flex items-center gap-3 rounded-md border border-blue-300 bg-blue-50 px-4 py-3">
                    <Eye size={18} className="text-blue-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-800">
                        頁面已載入，請選擇下一步
                      </p>
                      <p className="text-xs text-blue-600 mt-0.5">
                        如果需要先登入、選擇帳號或其他操作，請先手動完成
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleNeedManual}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-yellow-400 bg-yellow-50 px-3 py-2.5 text-sm font-medium text-yellow-700 hover:bg-yellow-100"
                    >
                      <Hand size={14} />
                      需要先手動操作（登入/選帳號）
                    </button>
                    <button
                      type="button"
                      onClick={handleDirectScan}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-green-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-green-700"
                    >
                      <Search size={14} />
                      直接開始 AI 掃描
                    </button>
                  </div>
                </div>
              )}

              {/* 手動操作中 */}
              {status === 'manual' && currentStep && (
                <div className="flex items-center gap-3 rounded-md border border-orange-300 bg-orange-50 px-4 py-3 w-full">
                  <Hand size={18} className="text-orange-600 animate-pulse" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-orange-800">
                      手動操作中 — 請在左側瀏覽器中完成操作
                    </p>
                    <p className="text-xs text-orange-600 mt-0.5">
                      截圖每 0.5 秒更新一次，你可以看到即時畫面
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleManualDone}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                  >
                    <CheckCircle2 size={14} />
                    準備好了，開始掃描
                  </button>
                </div>
              )}

              {status === 'exploring' && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <MousePointerClick size={16} className="animate-pulse" />
                  AI 正在探索頁面行為...
                </div>
              )}

              {status === 'scanning' && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 size={16} className="animate-spin" />
                  AI 正在掃描頁面元件...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Components + Test Cases (2/5) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Components section */}
          {components.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-2.5">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                  <Search size={14} className="text-blue-500" />
                  元件掃描結果
                  <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                    {components.length}
                  </span>
                </h3>
              </div>
              <div className="max-h-40 overflow-y-auto px-4 py-2 space-y-1">
                {components.map((comp, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-500">
                      {comp.type}
                    </span>
                    <span className="truncate">{comp.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Behaviors exploration results */}
          {behaviors.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-2.5">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                  <Eye size={14} className="text-purple-500" />
                  行為探索結果
                  <span className="ml-1 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-600">
                    {behaviors.filter(b => b.type !== 'no_effect').length}/{behaviors.length}
                  </span>
                </h3>
              </div>
              <div className="max-h-48 overflow-y-auto px-4 py-2 space-y-1">
                {behaviors.map((b, i) => {
                  const icon = (() => {
                    switch (b.type) {
                      case 'toggle': return <ToggleLeft size={12} className="text-green-500" />;
                      case 'navigation': return <ArrowRightLeft size={12} className="text-blue-500" />;
                      case 'modal': return <Maximize2 size={12} className="text-orange-500" />;
                      case 'dropdown': return <ChevronDown size={12} className="text-indigo-500" />;
                      case 'form_submit': return <CheckCircle2 size={12} className="text-teal-500" />;
                      default: return <MinusCircle size={12} className="text-gray-400" />;
                    }
                  })();
                  const typeLabel = (() => {
                    switch (b.type) {
                      case 'toggle': return 'toggle';
                      case 'navigation': return 'nav';
                      case 'modal': return 'modal';
                      case 'dropdown': return 'dropdown';
                      case 'form_submit': return 'submit';
                      default: return 'no_effect';
                    }
                  })();
                  const typeBg = (() => {
                    switch (b.type) {
                      case 'toggle': return 'bg-green-100 text-green-700';
                      case 'navigation': return 'bg-blue-100 text-blue-700';
                      case 'modal': return 'bg-orange-100 text-orange-700';
                      case 'dropdown': return 'bg-indigo-100 text-indigo-700';
                      case 'form_submit': return 'bg-teal-100 text-teal-700';
                      default: return 'bg-gray-100 text-gray-500';
                    }
                  })();
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      {icon}
                      <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] ${typeBg}`}>
                        {typeLabel}
                      </span>
                      <span className="truncate" title={b.selector}>{b.description}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI Discussion — chat style */}
          {discussion.length > 0 && (
            <div className="rounded-lg border border-indigo-200 bg-white overflow-hidden">
              <div className="flex items-center gap-2 bg-indigo-50 px-4 py-2">
                <Eye size={14} className="text-indigo-600" />
                <h3 className="text-xs font-semibold text-indigo-800">
                  AI 團隊討論
                </h3>
              </div>
              <div className="max-h-64 overflow-y-auto px-3 py-2 space-y-3">
                {discussion.map((d: any, i: number) => (
                  <div key={i} className="flex gap-2">
                    <div className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-sm">
                      {d.avatar || '🤖'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xs font-bold text-gray-800">{d.name || d.role}</span>
                        <span className="text-[10px] text-gray-400">{d.role}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-600 leading-relaxed whitespace-pre-line">{d.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review Result (post-test) */}
          {reviewResult && (
            <div className="rounded-lg border border-amber-200 bg-white overflow-hidden">
              <div className="flex items-center gap-2 bg-amber-50 px-4 py-2">
                <AlertTriangle size={14} className="text-amber-600" />
                <h3 className="text-xs font-semibold text-amber-800">
                  AI 審核結果
                </h3>
              </div>
              <div className="px-4 py-2 space-y-1 text-xs">
                <p className="text-gray-700">{reviewResult.summary}</p>
                {reviewResult.adjustments?.map((adj: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 rounded px-2 py-1 bg-gray-50">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      adj.action === 'keep' ? 'bg-red-100 text-red-700' :
                      adj.action === 'retry' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {adj.action === 'keep' ? '真 Bug' : adj.action === 'retry' ? '建議重試' : '移除'}
                    </span>
                    <span className="font-mono">{adj.caseId}</span>
                    <span className="text-gray-500">{adj.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Test task list */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4 py-2.5">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                <Play size={14} className="text-green-500" />
                測試任務清單
                {totalCases > 0 && (
                  <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                    {totalCases}
                  </span>
                )}
              </h3>
            </div>
            <div className="max-h-[420px] overflow-y-auto px-4 py-2">
              <TestTaskList
                testCases={testCases}
                onChange={setTestCases}
                disabled={isRunningOrPaused}
              />
            </div>

            {/* 一鍵建立專案 — 有測試案例且沒有現有專案時顯示 */}
            {projectId === 0 && testCases.length > 0 && !existingProject && (
              <div className="mt-3">
                {createdProjectId ? (
                  <a
                    href={`/projects/${createdProjectId}`}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700"
                  >
                    <FolderPlus className="h-4 w-4" />
                    前往專案 →
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={handleCreateProject}
                    disabled={creatingProject}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {creatingProject ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        建立中...
                      </>
                    ) : (
                      <>
                        <FolderPlus className="h-4 w-4" />
                        一鍵建立專案
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Summary (when done) */}
          {status === 'done' && totalCases > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">
                測試結果摘要
              </h3>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded-md bg-gray-50 p-2">
                  <div className="text-lg font-bold text-gray-800">
                    {totalCases}
                  </div>
                  <div className="text-gray-500">總數</div>
                </div>
                <div className="rounded-md bg-green-50 p-2">
                  <div className="text-lg font-bold text-green-600">
                    {passedCount}
                  </div>
                  <div className="text-green-600">通過</div>
                </div>
                <div className="rounded-md bg-red-50 p-2">
                  <div className="text-lg font-bold text-red-600">
                    {failedCount}
                  </div>
                  <div className="text-red-600">失敗</div>
                </div>
                <div className="rounded-md bg-gray-50 p-2">
                  <div className="text-lg font-bold text-gray-500">
                    {skippedCount}
                  </div>
                  <div className="text-gray-500">跳過</div>
                </div>
              </div>
              <div className="text-center">
                <span className="text-sm font-medium">
                  通過率：
                  <span
                    className={
                      passedCount / (totalCases - skippedCount) >= 0.8
                        ? 'text-green-600'
                        : 'text-red-600'
                    }
                  >
                    {totalCases - skippedCount > 0
                      ? Math.round(
                          (passedCount / (totalCases - skippedCount)) * 100,
                        )
                      : 0}
                    %
                  </span>
                </span>
              </div>

              {/* 重跑按鈕 */}
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleRerunAll}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                >
                  <RefreshCw size={14} />
                  重跑全部
                </button>
                {failedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleRerunFailed}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
                  >
                    <RefreshCw size={14} />
                    重跑失敗 ({failedCount})
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
