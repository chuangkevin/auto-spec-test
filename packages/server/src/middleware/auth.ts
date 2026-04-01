import type { FastifyRequest, FastifyReply } from 'fastify';
import type { TokenPayload } from '../services/authService.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: TokenPayload;
  }
}

/**
 * Auth hook — 簡化版，從 Authorization header 解析 user info
 * 沒有 token 時設定預設 admin user（不阻擋請求）
 */
export async function authHook(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;

  if (header && header.startsWith('Bearer ')) {
    try {
      const token = header.slice(7);
      const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64').toString());
      request.user = { id: payload.id || 1, username: payload.username || 'admin', role: payload.role || 'admin' };
      return;
    } catch {
      // token 解析失敗，用預設值
    }
  }

  // 沒有 token 或解析失敗 — 設定預設 admin user（不阻擋）
  request.user = { id: 1, username: 'admin', role: 'admin' };
}
