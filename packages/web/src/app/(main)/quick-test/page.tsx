'use client';

import { useState } from 'react';
import { Globe, ArrowRight } from 'lucide-react';
import TestExecutionPanel from '@/components/TestExecutionPanel';

export default function QuickTestPage() {
  const [url, setUrl] = useState('');
  const [started, setStarted] = useState(false);

  function handleStart() {
    if (!url.trim()) return;
    setStarted(true);
  }

  if (started) {
    return (
      <div className="h-full">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">快速測試</h1>
          <button
            className="text-sm text-gray-500 hover:text-gray-700"
            onClick={() => { setStarted(false); setUrl(''); }}
          >
            重新開始
          </button>
        </div>
        <TestExecutionPanel projectId={0} initialUrl={url} />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center">
      <div className="w-full max-w-2xl text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100">
            <Globe className="h-10 w-10 text-blue-600" />
          </div>
        </div>
        <h1 className="mb-2 text-3xl font-bold text-gray-900">快速測試</h1>
        <p className="mb-8 text-gray-800">
          貼上網址，AI 自動掃描頁面元件、規劃測試案例、逐條執行
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
            placeholder="https://your-website.com"
            className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            autoFocus
          />
          <button
            onClick={handleStart}
            disabled={!url.trim()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-lg font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            開始
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-4 text-sm text-gray-700">
          不需要建立專案或上傳規格書，直接測試任何網站
        </p>
      </div>
    </div>
  );
}
