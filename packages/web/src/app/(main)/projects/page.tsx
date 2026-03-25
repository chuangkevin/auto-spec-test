'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, FolderKanban } from 'lucide-react';
import { api } from '@/lib/api';
import type { Project, Product } from '@/types';

const statusLabel: Record<string, string> = {
  draft: '草稿',
  has_script: '已有腳本',
  testing: '測試中',
  completed: '已完成',
};

const statusColor: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  has_script: 'bg-blue-100 text-blue-700',
  testing: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
};

const statusOptions = [
  { value: '', label: '全部狀態' },
  { value: 'draft', label: '草稿' },
  { value: 'has_script', label: '已有腳本' },
  { value: 'testing', label: '測試中' },
  { value: 'completed', label: '已完成' },
];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProduct, setFilterProduct] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<Project[]>('/api/projects'),
      api.get<Product[]>('/api/products'),
    ])
      .then(([proj, prod]) => {
        setProjects(proj);
        setProducts(prod);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = projects.filter((p) => {
    if (filterProduct && String(p.product_id) !== filterProduct) return false;
    if (filterStatus && p.status !== filterStatus) return false;
    if (searchText && !p.name.toLowerCase().includes(searchText.toLowerCase()))
      return false;
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">測試專案</h1>
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          新建專案
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={filterProduct}
          onChange={(e) => setFilterProduct(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">全部產品</option>
          {products.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="搜尋專案名稱..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <p className="py-12 text-center text-gray-500">載入中...</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white py-16">
          <FolderKanban size={40} className="mb-3 text-gray-300" />
          <p className="mb-1 text-gray-500">尚無專案</p>
          <p className="text-sm text-gray-400">
            點擊「新建專案」建立你的第一個測試專案
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  專案名稱
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  產品
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  狀態
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  建立日期
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((project) => {
                const product = products.find(
                  (p) => p.id === project.product_id,
                );
                return (
                  <tr
                    key={project.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {project.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {project.product_name || product?.name || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor[project.status] || ''}`}
                      >
                        {statusLabel[project.status] || project.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(project.created_at).toLocaleDateString('zh-TW')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
