'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Archive,
  Download,
  FileText,
  Trash2,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { api, BASE_URL } from '@/lib/api';
import type { Product } from '@/types';

interface Spec {
  id: number;
  original_files: Array<{ name: string; path: string }>;
  parsed_outline_md: string | null;
  version: number;
  project_id: number;
  project_name: string;
  product_name: string;
  uploaded_by_name: string;
  created_at: string;
}

export default function SpecLibraryPage() {
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productFilter, setProductFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);

  const fetchSpecs = useCallback(async () => {
    setLoading(true);
    try {
      const params = productFilter ? `?product_id=${productFilter}` : '';
      const data = await api.get<Spec[]>(`/api/specifications${params}`);
      setSpecs(Array.isArray(data) ? data : []);
    } catch {
      setSpecs([]);
    } finally {
      setLoading(false);
    }
  }, [productFilter]);

  useEffect(() => {
    api.get<Product[]>('/api/products').then(setProducts).catch(() => {});
  }, []);

  useEffect(() => {
    fetchSpecs();
  }, [fetchSpecs]);

  async function handleDelete(id: number) {
    if (!confirm('確定要刪除此規格書？對應的測試腳本也會一併刪除。')) return;
    setDeleting(id);
    try {
      await api.delete(`/api/specifications/${id}`);
      fetchSpecs();
    } catch {
      alert('刪除失敗');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">規格書庫</h1>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">全部產品</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500">載入中...</span>
        </div>
      ) : specs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white py-12">
          <Archive className="mb-3 h-10 w-10 text-gray-300" />
          <p className="mb-1 text-gray-500">尚無規格書</p>
          <p className="text-sm text-gray-400">上傳規格書後會自動歸檔到這裡</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3">規格書檔案</th>
                <th className="px-4 py-3">測試腳本</th>
                <th className="px-4 py-3">所屬專案</th>
                <th className="px-4 py-3">產品</th>
                <th className="px-4 py-3">上傳人員</th>
                <th className="px-4 py-3">更新日期</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {specs.map((spec) => (
                <tr key={spec.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {spec.original_files.map((f, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <FileText className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-700">{f.name}</span>
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-3">
                    {spec.parsed_outline_md ? (
                      <button className="flex items-center gap-1 text-blue-600 hover:underline">
                        <Download className="h-4 w-4" />
                        下載 .md
                      </button>
                    ) : (
                      <span className="text-gray-400">尚未產出</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${spec.project_id}`}
                      className="flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      {spec.project_name}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{spec.product_name}</td>
                  <td className="px-4 py-3 text-gray-600">{spec.uploaded_by_name || '-'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(spec.created_at).toLocaleDateString('zh-TW')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link
                        href={`/projects/${spec.project_id}`}
                        className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                      >
                        更新
                      </Link>
                      <button
                        onClick={() => handleDelete(spec.id)}
                        disabled={deleting === spec.id}
                        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {deleting === spec.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
