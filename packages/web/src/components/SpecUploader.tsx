'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, FileText, Loader2 } from 'lucide-react';

const ACCEPTED_TYPES = ['.md', '.docx', '.xls', '.xlsx', '.csv'];

interface SpecUploaderProps {
  projectId: number;
  onUploadComplete: () => void;
}

export default function SpecUploader({ projectId, onUploadComplete }: SpecUploaderProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAccepted = (file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    return ACCEPTED_TYPES.includes(ext);
  };

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const valid = Array.from(incoming).filter(isAccepted);
    if (valid.length === 0) {
      setError('不支援的檔案格式，請上傳 .md、.docx、.xls、.xlsx 或 .csv');
      return;
    }
    setError(null);
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      const newFiles = valid.filter((f) => !names.has(f.name));
      return [...prev, ...newFiles];
    });
  }, []);

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));

      const token = localStorage.getItem('token');
      const xhr = new XMLHttpRequest();

      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(xhr.responseText || '上傳失敗'));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('網路錯誤')));

        xhr.open('POST', `http://localhost:3001/api/projects/${projectId}/specifications/upload`);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
      });

      setFiles([]);
      setProgress(100);
      onUploadComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '上傳失敗');
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
        }`}
      >
        <Upload className="mx-auto mb-3 text-gray-400" size={36} />
        <p className="text-sm font-medium text-gray-700">
          拖曳檔案到此處，或點擊選取檔案
        </p>
        <p className="mt-1 text-xs text-gray-500">
          支援格式：.md、.docx、.xls、.xlsx、.csv
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(',')}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f) => (
            <li
              key={f.name}
              className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2"
            >
              <div className="flex items-center gap-2 text-sm">
                <FileText size={16} className="text-gray-400" />
                <span className="font-medium text-gray-700">{f.name}</span>
                <span className="text-gray-400">{formatSize(f.size)}</span>
              </div>
              <button
                onClick={() => removeFile(f.name)}
                className="text-gray-400 hover:text-red-500"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Progress bar */}
      {uploading && (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 text-right">{progress}%</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Upload button */}
      <button
        disabled={files.length === 0 || uploading}
        onClick={handleUpload}
        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            上傳中...
          </>
        ) : (
          <>
            <Upload size={16} />
            上傳規格書
          </>
        )}
      </button>
    </div>
  );
}
