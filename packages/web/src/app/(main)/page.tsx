'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Globe,
  FolderKanban,
  Package,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
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

export default function DashboardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Project[]>('/api/projects?sort=created_at'),
      api.get<Product[]>('/api/products'),
    ])
      .then(([proj, prod]) => {
        setProjects(proj.slice(0, 5));
        setProductCount(prod.length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">
        歡迎回來，{user?.username}
      </h1>

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2">
              <FolderKanban size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">專案數量</p>
              <p className="text-2xl font-bold text-gray-800">
                {loading ? '-' : projects.length}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-50 p-2">
              <Package size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">產品數量</p>
              <p className="text-2xl font-bold text-gray-800">
                {loading ? '-' : productCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-gray-700">快速操作</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            新建專案
          </Link>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-400 cursor-not-allowed"
          >
            <Globe size={16} />
            URL 快速測試
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-400">
              即將推出
            </span>
          </button>
        </div>
      </section>

      {/* Recent projects */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-700">近期專案</h2>
          <Link
            href="/projects"
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
          >
            查看全部
            <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <p className="py-8 text-center text-gray-500">載入中...</p>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white py-12">
            <FolderKanban size={36} className="mb-3 text-gray-300" />
            <p className="mb-1 text-gray-500">尚無專案</p>
            <p className="text-sm text-gray-400">
              點擊「新建專案」開始使用
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <h3 className="mb-2 font-medium text-gray-800">
                  {project.name}
                </h3>
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor[project.status] || ''}`}
                  >
                    {statusLabel[project.status] || project.status}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(project.created_at).toLocaleDateString('zh-TW')}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
