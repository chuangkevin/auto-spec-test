'use client';

import { Loader2, Monitor, Globe } from 'lucide-react';

export interface BrowserViewerProps {
  screenshot: string | null; // base64
  currentStep: string;
  status: string;
  pageInfo?: { url: string; title: string };
}

export default function BrowserViewer({
  screenshot,
  currentStep,
  status,
  pageInfo,
}: BrowserViewerProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Browser address bar */}
      {pageInfo && (
        <div className="flex items-center gap-2 rounded-t-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-500">
          <Globe size={12} className="shrink-0" />
          <span className="truncate">{pageInfo.url}</span>
          {pageInfo.title && (
            <span className="ml-auto truncate text-gray-400">
              {pageInfo.title}
            </span>
          )}
        </div>
      )}

      {/* Screenshot area — 16:9 ratio */}
      <div
        className={`relative w-full overflow-hidden bg-gray-900 ${
          pageInfo ? 'rounded-b-lg border-x border-b' : 'rounded-lg border'
        } border-gray-200`}
        style={{ aspectRatio: '16 / 9' }}
      >
        {/* idle placeholder */}
        {status === 'idle' && !screenshot && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
            <Monitor size={48} className="mb-3 opacity-50" />
            <p className="text-sm">輸入 URL 開始測試</p>
          </div>
        )}

        {/* scanning spinner */}
        {status === 'scanning' && !screenshot && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300">
            <Loader2 size={40} className="mb-3 animate-spin" />
            <p className="text-sm">AI 正在掃描頁面...</p>
          </div>
        )}

        {/* screenshot image */}
        {screenshot && (
          <img
            src={
              screenshot.startsWith('data:')
                ? screenshot
                : `data:image/png;base64,${screenshot}`
            }
            alt="瀏覽器截圖"
            className="h-full w-full object-contain"
          />
        )}

        {/* scanning overlay on top of screenshot */}
        {status === 'scanning' && screenshot && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="flex items-center gap-2 rounded-lg bg-black/70 px-4 py-2 text-sm text-white">
              <Loader2 size={16} className="animate-spin" />
              AI 正在掃描頁面...
            </div>
          </div>
        )}

        {/* Current step bar (bottom overlay) */}
        {currentStep && status !== 'idle' && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-4 py-2">
            <p className="text-xs text-gray-300">目前步驟</p>
            <p className="text-sm text-white">{currentStep}</p>
          </div>
        )}
      </div>
    </div>
  );
}
