'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Plus, User as UserIcon } from 'lucide-react';

interface UserProfile {
  id: number;
  username: string;
  email: string;
  role: string;
}

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-red-500',
  'bg-indigo-500',
];

export default function LoginPage() {
  const router = useRouter();
  const { user, selectUser, registerUser } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    if (user) {
      router.replace('/');
      return;
    }
    api
      .get<UserProfile[]>('/api/auth/users')
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, router]);

  async function handleSelect(u: UserProfile) {
    setSelecting(true);
    setError('');
    try {
      await selectUser(u.id);
      router.push('/');
    } catch {
      setError('選擇失敗，請重試');
      setSelecting(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setError('');
    try {
      await registerUser(newName.trim());
      router.push('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '建立失敗');
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900">
        <p className="text-gray-400">載入中...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 px-4">
      <h1 className="mb-2 text-3xl font-bold text-white">Auto Spec Test</h1>
      <p className="mb-10 text-gray-400">選擇你的身分</p>

      <div className="flex flex-wrap justify-center gap-6 mb-8">
        {users.map((u, i) => (
          <button
            key={u.id}
            onClick={() => handleSelect(u)}
            disabled={selecting}
            className="group flex flex-col items-center gap-3 transition-transform hover:scale-105 disabled:opacity-50"
          >
            <div
              className={`flex h-24 w-24 items-center justify-center rounded-lg text-3xl font-bold text-white ${AVATAR_COLORS[i % AVATAR_COLORS.length]} ring-2 ring-transparent group-hover:ring-white transition-all`}
            >
              {u.username.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm text-gray-300 group-hover:text-white">
              {u.username}
            </span>
          </button>
        ))}

        {/* 新增使用者按鈕 */}
        <button
          onClick={() => setShowCreate(true)}
          className="group flex flex-col items-center gap-3 transition-transform hover:scale-105"
        >
          <div className="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-gray-600 text-gray-500 group-hover:border-white group-hover:text-white transition-all">
            <Plus size={36} />
          </div>
          <span className="text-sm text-gray-500 group-hover:text-white">
            新增使用者
          </span>
        </button>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-400">{error}</p>
      )}

      {/* 建立使用者 modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl bg-gray-800 p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-semibold text-white">新增使用者</h2>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="輸入你的名稱"
              autoFocus
              className="mb-4 w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCreate(false); setNewName(''); setError(''); }}
                className="flex-1 rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                建立
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
