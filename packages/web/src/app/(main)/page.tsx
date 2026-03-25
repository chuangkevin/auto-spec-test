'use client';

import { useAuth } from '@/lib/auth';

const mockProjects = [
  {
    id: 1,
    name: '電商平台登入模組',
    status: 'testing' as const,
    updated_at: '2026-03-24',
  },
  {
    id: 2,
    name: '行動支付 API 整合',
    status: 'has_script' as const,
    updated_at: '2026-03-23',
  },
  {
    id: 3,
    name: '後台報表系統',
    status: 'draft' as const,
    updated_at: '2026-03-22',
  },
];

const statusLabel: Record<string, string> = {
  draft: '草稿',
  has_script: '已產出腳本',
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

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">
        歡迎回來，{user?.username}
      </h1>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-700">近期專案</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mockProjects.map((project) => (
            <div
              key={project.id}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <h3 className="mb-2 font-medium text-gray-800">
                {project.name}
              </h3>
              <div className="flex items-center justify-between">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor[project.status]}`}
                >
                  {statusLabel[project.status]}
                </span>
                <span className="text-xs text-gray-400">
                  {project.updated_at}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
