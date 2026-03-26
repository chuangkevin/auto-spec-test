'use client';

import { useRef, useCallback } from 'react';
import { Loader2, Monitor, Globe, MousePointer2 } from 'lucide-react';
import { api } from '@/lib/api';

export interface BrowserViewerProps {
  screenshot: string | null;
  currentStep: string;
  status: string;
  pageInfo?: { url: string; title: string };
  sessionId?: string | null;
  interactive?: boolean; // 是否允許點擊操作
}

export default function BrowserViewer({
  screenshot,
  currentStep,
  status,
  pageInfo,
  sessionId,
  interactive = false,
}: BrowserViewerProps) {
  const imgRef = useRef<HTMLImageElement>(null);

  const handleClick = useCallback(async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!interactive || !sessionId || !imgRef.current) return;

    const rect = imgRef.current.getBoundingClientRect();
    // 計算點擊在圖片上的相對座標（0-1）
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;

    // 轉換為 Playwright 視窗座標（1280x720）
    const x = Math.round(relX * 1280);
    const y = Math.round(relY * 720);

    try {
      await api.post(`/api/test-runner/${sessionId}/click`, { x, y });
    } catch {
      // ignore click errors
    }
  }, [interactive, sessionId]);

  const handleKeyDown = useCallback(async (e: React.KeyboardEvent) => {
    if (!interactive || !sessionId) return;
    // 攔截常用按鍵送到 Playwright
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape') {
      e.preventDefault();
      try {
        await api.post(`/api/test-runner/${sessionId}/key`, { key: e.key });
      } catch {}
    }
  }, [interactive, sessionId]);

  const handleType = useCallback(async (e: React.KeyboardEvent) => {
    if (!interactive || !sessionId) return;
    // 只處理可列印字元
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      try {
        await api.post(`/api/test-runner/${sessionId}/type`, { text: e.key });
      } catch {}
    }
  }, [interactive, sessionId]);

  return (
    <div className="flex flex-col h-full">
      {/* Browser address bar */}
      {pageInfo && (
        <div className="flex items-center gap-2 rounded-t-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-500">
          <Globe size={12} className="shrink-0" />
          <span className="truncate">{pageInfo.url}</span>
          {interactive && (
            <span className="ml-auto flex items-center gap-1 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
              <MousePointer2 size={10} />
              可互動
            </span>
          )}
          {pageInfo.title && !interactive && (
            <span className="ml-auto truncate text-gray-400">
              {pageInfo.title}
            </span>
          )}
        </div>
      )}

      {/* Screenshot area */}
      <div
        className={`relative w-full overflow-hidden bg-gray-900 ${
          pageInfo ? 'rounded-b-lg border-x border-b' : 'rounded-lg border'
        } border-gray-200 ${interactive ? 'cursor-pointer' : ''}`}
        style={{ aspectRatio: '16 / 9' }}
        tabIndex={interactive ? 0 : undefined}
        onKeyDown={interactive ? (e) => { handleKeyDown(e); handleType(e); } : undefined}
      >
        {/* idle placeholder */}
        {status === 'idle' && !screenshot && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
            <Monitor size={48} className="mb-3 opacity-50" />
            <p className="text-sm">輸入 URL 開始測試</p>
          </div>
        )}

        {/* scanning spinner */}
        {(status === 'scanning' || status === 'exploring') && !screenshot && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300">
            <Loader2 size={40} className="mb-3 animate-spin" />
            <p className="text-sm">AI 正在掃描頁面...</p>
          </div>
        )}

        {/* screenshot image — 可點擊 */}
        {screenshot && (
          <img
            ref={imgRef}
            src={
              screenshot.startsWith('data:')
                ? screenshot
                : `data:image/jpeg;base64,${screenshot}`
            }
            alt="瀏覽器截圖"
            className={`h-full w-full object-contain ${interactive ? 'cursor-crosshair' : ''}`}
            onClick={interactive ? handleClick : undefined}
            draggable={false}
          />
        )}

        {/* scanning overlay */}
        {(status === 'scanning' || status === 'exploring') && screenshot && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="flex items-center gap-2 rounded-lg bg-black/70 px-4 py-2 text-sm text-white">
              <Loader2 size={16} className="animate-spin" />
              {status === 'exploring' ? 'AI 正在探索頁面行為...' : 'AI 正在掃描頁面...'}
            </div>
          </div>
        )}

        {/* Interactive mode hint */}
        {interactive && screenshot && status === 'manual' && (
          <div className="absolute top-2 right-2 rounded bg-orange-500/80 px-2 py-1 text-[10px] text-white">
            點擊截圖操作瀏覽器
          </div>
        )}

        {/* Current step bar */}
        {currentStep && status !== 'idle' && status !== 'preview' && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">🧪</span>
              <div>
                <p className="text-[10px] text-gray-400">James 正在測試</p>
                <p className="text-sm text-white">{currentStep}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
