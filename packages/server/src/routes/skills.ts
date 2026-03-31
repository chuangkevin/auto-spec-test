import type { FastifyInstance } from 'fastify';
import { authHook } from '../middleware/auth.js';
import { skillService } from '../services/skillService.js';

export default async function skillRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authHook);

  // GET /api/skills — 列出所有 skill
  fastify.get('/api/skills', async () => {
    return skillService.getAll();
  });

  // GET /api/skills/:id — 取得單個 skill
  fastify.get<{ Params: { id: string } }>('/api/skills/:id', async (request, reply) => {
    const skill = skillService.getById(request.params.id);
    if (!skill) return reply.status(404).send({ error: 'Skill 不存在' });
    return skill;
  });

  // POST /api/skills — 建立 skill
  fastify.post<{
    Body: { name: string; description?: string; content: string };
  }>('/api/skills', async (request, reply) => {
    const { name, content } = request.body;
    if (!name || !content) return reply.status(400).send({ error: '請提供 name 和 content' });

    try {
      const skill = skillService.create(request.body);
      return reply.status(201).send(skill);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE')) {
        return reply.status(409).send({ error: `Skill "${name}" 已存在` });
      }
      throw err;
    }
  });

  // PUT /api/skills/:id — 更新 skill
  fastify.put<{
    Params: { id: string };
    Body: { name?: string; description?: string; content?: string };
  }>('/api/skills/:id', async (request, reply) => {
    const skill = skillService.update(request.params.id, request.body);
    if (!skill) return reply.status(404).send({ error: 'Skill 不存在' });
    return skill;
  });

  // DELETE /api/skills/:id — 刪除 skill
  fastify.delete<{ Params: { id: string } }>('/api/skills/:id', async (request, reply) => {
    const ok = skillService.remove(request.params.id);
    if (!ok) return reply.status(404).send({ error: 'Skill 不存在' });
    return { ok: true };
  });

  // POST /api/skills/:id/toggle — 啟用/停用
  fastify.post<{ Params: { id: string } }>('/api/skills/:id/toggle', async (request, reply) => {
    const skill = skillService.toggle(request.params.id);
    if (!skill) return reply.status(404).send({ error: 'Skill 不存在' });
    return skill;
  });

  // POST /api/skills/batch — 批次匯入
  fastify.post<{
    Body: { skills: Array<{ name: string; description?: string; content: string }> };
  }>('/api/skills/batch', async (request, reply) => {
    const { skills } = request.body;
    if (!skills || !Array.isArray(skills) || skills.length === 0) {
      return reply.status(400).send({ error: '請提供 skills 陣列' });
    }
    const result = skillService.batchImport(skills);
    return result;
  });
}
