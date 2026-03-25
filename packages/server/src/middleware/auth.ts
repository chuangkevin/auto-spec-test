import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, type TokenPayload } from '../services/authService.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: TokenPayload;
  }
}

export async function authHook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = verifyToken(token);
    request.user = payload;
  } catch {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}
