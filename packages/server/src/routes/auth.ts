import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/connection.js';
import {
  hashPassword,
  generateToken,
} from '../services/authService.js';
import { authHook } from '../middleware/auth.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // 取得所有使用者（用於選擇畫面）
  app.get('/api/auth/users', async () => {
    const db = getDb();
    const users = db
      .prepare('SELECT id, username, email, role, created_at FROM users ORDER BY created_at ASC')
      .all();
    return users;
  });

  // 選擇使用者（Netflix 風格，不需密碼）
  app.post<{
    Body: { userId: number };
  }>('/api/auth/select', async (request, reply) => {
    const { userId } = request.body;
    const db = getDb();

    const user = db
      .prepare('SELECT id, username, email, role FROM users WHERE id = ?')
      .get(userId) as
      | { id: number; username: string; email: string; role: string }
      | undefined;

    if (!user) {
      return reply.code(404).send({ error: '使用者不存在' });
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });

    return reply.send({ token, user });
  });

  // 建立新使用者
  app.post<{
    Body: { username: string; email?: string };
  }>('/api/auth/register', async (request, reply) => {
    const { username, email } = request.body;
    const db = getDb();

    if (!username || username.trim().length === 0) {
      return reply.code(400).send({ error: '請輸入名稱' });
    }

    const existing = db
      .prepare('SELECT id FROM users WHERE username = ?')
      .get(username.trim());

    if (existing) {
      return reply.code(400).send({ error: '此名稱已被使用' });
    }

    const userEmail = email || `${username.trim().toLowerCase().replace(/\s+/g, '')}@local`;
    const dummyHash = hashPassword('unused');

    const info = db.prepare(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
    ).run(username.trim(), userEmail, dummyHash, 'user');

    const user = {
      id: Number(info.lastInsertRowid),
      username: username.trim(),
      email: userEmail,
      role: 'user',
    };

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });

    return reply.code(201).send({ token, user });
  });

  // 取得目前使用者資訊
  app.get('/api/auth/me', { preHandler: [authHook] }, async (request, reply) => {
    const db = getDb();
    const user = db
      .prepare('SELECT id, username, email, role FROM users WHERE id = ?')
      .get(request.user.id) as
      | { id: number; username: string; email: string; role: string }
      | undefined;

    if (!user) {
      return reply.code(401).send({ error: '使用者不存在' });
    }

    return reply.send({ user });
  });
}
