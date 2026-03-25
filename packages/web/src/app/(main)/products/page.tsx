'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Package, X, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { Product } from '@/types';

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  // form state
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  function fetchProducts() {
    api
      .get<Product[]>('/api/products')
      .then(setProducts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchProducts();
  }, []);

  function openModal() {
    setFormName('');
    setFormCode('');
    setFormDesc('');
    setFormError('');
    setShowModal(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    if (!formName.trim()) {
      setFormError('請輸入產品名稱');
      return;
    }

    setSubmitting(true);
    try {
      const product = await api.post<Product>('/api/products', {
        name: formName.trim(),
        code: formCode.trim() || undefined,
        description: formDesc.trim() || undefined,
      });
      setProducts((prev) => [...prev, product]);
      setShowModal(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : '建立失敗，請稍後再試';
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('確定要刪除此產品嗎？此操作無法復原。')) return;

    setDeleting(id);
    try {
      await api.delete(`/api/products/${id}`);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : '刪除失敗，請稍後再試';
      alert(message);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">產品管理</h1>
        <button
          onClick={openModal}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          新增產品
        </button>
      </div>

      {/* List */}
      {loading ? (
        <p className="py-12 text-center text-gray-500">載入中...</p>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white py-16">
          <Package size={40} className="mb-3 text-gray-300" />
          <p className="mb-1 text-gray-500">尚無產品</p>
          <p className="text-sm text-gray-400">
            點擊「新增產品」建立你的第一個產品
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <div
              key={product.id}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-gray-800">{product.name}</h3>
                  {product.code && (
                    <span className="mt-0.5 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      {product.code}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(product.id)}
                  disabled={deleting === product.id}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 transition-colors"
                  title="刪除產品"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {product.description && (
                <p className="text-sm text-gray-500">{product.description}</p>
              )}
              <p className="mt-3 text-xs text-gray-400">
                建立於{' '}
                {new Date(product.created_at).toLocaleDateString('zh-TW')}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowModal(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">新增產品</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {formError && (
                <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  產品名稱 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="例如：電商平台"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  產品代碼
                </label>
                <input
                  type="text"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  placeholder="選填，例如：ECOM"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  描述
                </label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={2}
                  placeholder="選填"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {submitting && (
                    <Loader2 size={16} className="animate-spin" />
                  )}
                  建立
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
