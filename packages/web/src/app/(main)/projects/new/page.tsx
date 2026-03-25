'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, GitBranch } from 'lucide-react';
import { api } from '@/lib/api';
import type { Product, Project } from '@/types';

interface GiteaRepo {
  id: number;
  full_name: string;
  description?: string;
}

interface GiteaStatus {
  connected: boolean;
}

export default function NewProjectPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [productId, setProductId] = useState('');
  const [description, setDescription] = useState('');

  // Gitea 相關
  const [giteaConnected, setGiteaConnected] = useState(false);
  const [giteaRepos, setGiteaRepos] = useState<GiteaRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [giteaRepo, setGiteaRepo] = useState('');

  useEffect(() => {
    api
      .get<Product[]>('/api/products')
      .then(setProducts)
      .catch(() => {})
      .finally(() => setLoadingProducts(false));

    // 檢查 Gitea 連接狀態
    api
      .get<GiteaStatus>('/api/gitea/status')
      .then((data) => {
        setGiteaConnected(data.connected);
        if (data.connected) {
          setLoadingRepos(true);
          api
            .get<GiteaRepo[]>('/api/gitea/repos')
            .then(setGiteaRepos)
            .catch(() => {})
            .finally(() => setLoadingRepos(false));
        }
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('請輸入專案名稱');
      return;
    }
    if (!productId) {
      setError('請選擇產品');
      return;
    }

    setSubmitting(true);
    try {
      const project = await api.post<Project>('/api/projects', {
        name: name.trim(),
        product_id: Number(productId),
        description: description.trim() || undefined,
        gitea_repo: giteaRepo || undefined,
      });
      router.push(`/projects/${project.id}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : '建立失敗，請稍後再試';
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} />
          返回專案列表
        </Link>
      </div>

      <h1 className="mb-6 text-2xl font-bold text-gray-800">新建專案</h1>

      {loadingProducts ? (
        <p className="text-gray-500">載入中...</p>
      ) : products.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="mb-2 text-gray-600">尚無可用產品</p>
          <p className="text-sm text-gray-400">
            請先{' '}
            <Link
              href="/products"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              建立產品
            </Link>{' '}
            後再新建專案
          </p>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-lg border border-gray-200 bg-white p-6"
        >
          {error && (
            <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              專案名稱 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：電商平台登入模組測試"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="product-select" className="mb-1 block text-sm font-medium text-gray-700">
              所屬產品 <span className="text-red-500">*</span>
            </label>
            <select
              id="product-select"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">請選擇產品</option>
              {products.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                  {p.code ? ` (${p.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              描述
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="選填，簡述專案目標或範圍"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Gitea Repository 選擇（選填） */}
          <div>
            <label htmlFor="gitea-repo-select" className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <GitBranch size={14} className="text-green-600" />
              Gitea Repository
              <span className="text-xs font-normal text-gray-400">（選填）</span>
            </label>
            {!giteaConnected ? (
              <p className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-400">
                連接 Gitea 後可綁定 Repository（前往
                <Link href="/settings" className="text-green-600 hover:text-green-800 underline mx-1">
                  系統設定
                </Link>
                連接）
              </p>
            ) : loadingRepos ? (
              <div className="flex items-center gap-1.5 text-sm text-gray-400">
                <Loader2 size={14} className="animate-spin" />
                載入 Repository 列表…
              </div>
            ) : (
              <select
                id="gitea-repo-select"
                value={giteaRepo}
                onChange={(e) => setGiteaRepo(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              >
                <option value="">不綁定</option>
                {giteaRepos.map((r) => (
                  <option key={r.id} value={r.full_name}>
                    {r.full_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              建立專案
            </button>
            <Link
              href="/projects"
              className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              取消
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
