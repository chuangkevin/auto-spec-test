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

type SessionStatus =
  | 'idle'
  | 'scanning'
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
    return 'ws://localhost:3001';
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
              const d = msg.data as { screenshot: string; pageInfo?: PageInfo };
              setScreenshot(d.screenshot);
              if (d.pageInfo) setPageInfo(d.pageInfo);
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
                status: 'passed' | 'failed' | 'skipped';
                actualResult?: string;
                screenshot?: string;
              };
              setTestCases((prev) =>
                prev.map((tc) =>
                  tc.id === d.testCaseId
                    ? {
                        ...tc,
                        status: d.status,
                        actualResult: d.actualResult,
                        screenshot: d.screenshot ?? tc.screenshot,
                      }
                    : tc,
                ),
              );
              break;
            }
            case 'status': {
              const d = msg.data as { status: SessionStatus };
              setStatus(d.status);
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
        console.log('[WS] disconnected');
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
    setStatus('scanning');
    setComponents([]);
    setTestCases([]);
    setScreenshot(null);
    setCurrentStep('');

    try {
      // Start session
      const res = await api.post<{ sessionId: string }>(
        '/api/test-runner/start',
        { url: url.trim(), projectId, specContent },
      );
      setSessionId(res.sessionId);
      connectWs(res.sessionId);

      // Trigger scan
      const scanRes = await api.post<{
        components: Component[];
        testPlan: TestCase[];
      }>(`/api/test-runner/${res.sessionId}/scan`, { url: url.trim() });

      setComponents(scanRes.components);
      setTestCases(scanRes.testPlan.map((tc) => ({ ...tc, selected: true })));
      setStatus('ready');

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '掃描失敗');
      setStatus('idle');
    }
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
      const selectedCases = testCases.filter((tc) => tc.selected);
      await api.post(`/api/test-runner/${sessionId}/execute`, {
        testCases: selectedCases,
      });
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
    setCurrentStep('');
    setPageInfo(undefined);
    setError(null);
  };

  /* ---- Derived ---- */

  const totalCases = testCases.length;
  const passedCount = testCases.filter((tc) => tc.status === 'passed').length;
  const failedCount = testCases.filter((tc) => tc.status === 'failed').length;
  const skippedCount = testCases.filter((tc) => tc.status === 'skipped').length;
  const isRunningOrPaused = status === 'running' || status === 'paused';

  return (
    <div className="space-y-4">
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

      {/* Main layout: left browser + right panel */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Left: Browser viewer (3/5) */}
        <div className="lg:col-span-3 space-y-3">
          <BrowserViewer
            screenshot={screenshot}
            currentStep={currentStep}
            status={status}
            pageInfo={pageInfo}
          />

          {/* Control buttons */}
          {status !== 'idle' && (
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
