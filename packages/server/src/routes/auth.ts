import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/connection.js';
import {
  verifyPassword,
  generateToken,
} from '../services/authService.js';
import { authHook } from '../middleware/auth.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: { username: string; password: string };
  }>('/api/auth/login', async (request, reply) => {
    const { username, password } = request.body;

    const db = getDb();
    const user = db
      .prepare('SELECT id, username, password, email, role FROM users WHERE username = ?')
      .get(username) as
      | { id: number; username: string; password: string; email: string; role: string }
      | undefined;

    if (!user || !verifyPassword(password, user.password)) {
      return reply.code(401).send({ error: 'Invalid username or password' });
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });

    return reply.send({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  });

  app.get('/api/auth/me', { preHandler: [authHook] }, async (request, reply) => {
    const db = getDb();
    const user = db
      .prepare('SELECT id, username, email, role FROM users WHERE id = ?')
      .get(request.user.id) as
      | { id: number; username: string; email: string; role: string }
      | undefined;

    if (!user) {
      return reply.code(401).send({ error: 'User not found' });
    }

    return reply.send({ user });
  });
}
