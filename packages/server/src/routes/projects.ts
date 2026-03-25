import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/connection.js';
import { authHook } from '../middleware/auth.js';

export default async function projectRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authHook);

  // GET /api/projects - 專案列表
  fastify.get<{
    Querystring: {
      product_id?: string;
      status?: string;
      search?: string;
      sort?: string;
    };
  }>('/api/projects', async (request, reply) => {
    const { product_id, status, search, sort } = request.query;
    const db = getDb();

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (product_id) {
      conditions.push('p.product_id = ?');
      params.push(product_id);
    }

    if (status) {
      conditions.push('p.status = ?');
      params.push(status);
    }

    if (search) {
      conditions.push('p.name LIKE ?');
      params.push(`%${search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 排序
    let orderClause = 'ORDER BY p.created_at DESC';
    if (sort === 'name') {
      orderClause = 'ORDER BY p.name ASC';
    } else if (sort === 'created_at') {
      orderClause = 'ORDER BY p.created_at DESC';
    }

    const sql = `
      SELECT p.id, p.name, p.product_id, p.description, p.status,
             p.created_by, p.created_at, p.updated_at,
             pr.name as product_name
      FROM projects p
      LEFT JOIN products pr ON p.product_id = pr.id
      ${whereClause}
      ${orderClause}
    `;

    const projects = db.prepare(sql).all(...params);

    return reply.send(projects);
  });

  // POST /api/projects - 建立專案
  fastify.post<{
    Body: { name: string; product_id: string; description?: string };
  }>('/api/projects', async (request, reply) => {
    const { name, product_id, description } = request.body;
    const db = getDb();

    // 檢查產品是否存在
    const product = db
      .prepare('SELECT id FROM products WHERE id = ?')
      .get(product_id);

    if (!product) {
      return reply.code(400).send({ error: 'Product not found' });
    }

    const info = db.prepare(
      'INSERT INTO projects (name, product_id, description, status, created_by) VALUES (?, ?, ?, ?, ?)',
    ).run(name, product_id, description ?? null, 'draft', request.user.id);

    const project = db
      .prepare(`
        SELECT p.id, p.name, p.product_id, p.description, p.status,
               p.created_by, p.created_at, p.updated_at,
               pr.name as product_name
        FROM projects p
        LEFT JOIN products pr ON p.product_id = pr.id
        WHERE p.id = ?
      `)
      .get(info.lastInsertRowid);

    return reply.code(201).send(project);
  });

  // GET /api/projects/:id - 專案詳情
  fastify.get<{
    Params: { id: string };
  }>('/api/projects/:id', async (request, reply) => {
    const { id } = request.params;
    const db = getDb();

    const project = db
      .prepare(`
        SELECT p.id, p.name, p.product_id, p.description, p.status,
               p.created_by, p.created_at, p.updated_at,
               pr.name as product_name
        FROM projects p
        LEFT JOIN products pr ON p.product_id = pr.id
        WHERE p.id = ?
      `)
      .get(id) as Record<string, unknown> | undefined;

    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    // 最新腳本版本
    const latestScript = db
      .prepare(
        'SELECT version FROM test_scripts WHERE project_id = ? ORDER BY version DESC LIMIT 1',
      )
      .get(id) as { version: number } | undefined;

    // 規格數量
    const specCount = db
      .prepare('SELECT COUNT(*) as count FROM specifications WHERE project_id = ?')
      .get(id) as { count: number };

    // 腳本數量
    const scriptCount = db
      .prepare('SELECT COUNT(*) as count FROM test_scripts WHERE project_id = ?')
      .get(id) as { count: number };

    return reply.send({
      ...project,
      latest_script_version: latestScript?.version ?? null,
      specification_count: specCount.count,
      script_count: scriptCount.count,
    });
  });

  // PUT /api/projects/:id - 更新專案
  fastify.put<{
    Params: { id: string };
    Body: { name?: string; product_id?: string; description?: string; status?: string };
  }>('/api/projects/:id', async (request, reply) => {
    const { id } = request.params;
    const { name, product_id, description, status } = request.body;
    const db = getDb();

    const existing = db
      .prepare('SELECT id, name, product_id, description, status FROM projects WHERE id = ?')
      .get(id) as {
        id: string;
        name: string;
        product_id: string;
        description: string | null;
        status: string;
      } | undefined;

    if (!existing) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    // 如果更新 product_id，檢查產品是否存在
    if (product_id && product_id !== existing.product_id) {
      const product = db
        .prepare('SELECT id FROM products WHERE id = ?')
        .get(product_id);

      if (!product) {
        return reply.code(400).send({ error: 'Product not found' });
      }
    }

    // 驗證 status
    const validStatuses = ['draft', 'has_script', 'testing', 'completed'];
    if (status && !validStatuses.includes(status)) {
      return reply.code(400).send({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    db.prepare(
      `UPDATE projects SET name = ?, product_id = ?, description = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(
      name ?? existing.name,
      product_id ?? existing.product_id,
      description !== undefined ? description : existing.description,
      status ?? existing.status,
      id,
    );

    const updated = db
      .prepare(`
        SELECT p.id, p.name, p.product_id, p.description, p.status,
               p.created_by, p.created_at, p.updated_at,
               pr.name as product_name
        FROM projects p
        LEFT JOIN products pr ON p.product_id = pr.id
        WHERE p.id = ?
      `)
      .get(id);

    return reply.send(updated);
  });

  // DELETE /api/projects/:id - 刪除專案（CASCADE）
  fastify.delete<{
    Params: { id: string };
  }>('/api/projects/:id', async (request, reply) => {
    const { id } = request.params;
    const db = getDb();

    const existing = db
      .prepare('SELECT id FROM projects WHERE id = ?')
      .get(id);

    if (!existing) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    // CASCADE 由 SQLite foreign key ON DELETE CASCADE 處理（specifications, test_scripts）
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);

    return reply.send({ message: 'Project deleted' });
  });
}
