import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/connection.js';
import { authHook } from '../middleware/auth.js';

export default async function productRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authHook);

  // GET /api/products - 產品列表（全部）
  fastify.get('/api/products', async (_request, reply) => {
    const db = getDb();
    const products = db
      .prepare('SELECT id, name, code, description, created_by, created_at FROM products ORDER BY created_at DESC')
      .all();

    return reply.send(products);
  });

  // POST /api/products - 建立產品
  fastify.post<{
    Body: { name: string; code?: string; description?: string };
  }>('/api/products', async (request, reply) => {
    const { name, code, description } = request.body;
    const db = getDb();

    // name 不可重複
    const existing = db
      .prepare('SELECT id FROM products WHERE name = ?')
      .get(name);

    if (existing) {
      return reply.code(400).send({ error: 'Product name already exists' });
    }

    const id = randomUUID();
    const productCode = code ?? name.toLowerCase().replace(/\s+/g, '-');

    // code 也不可重複（schema UNIQUE constraint）
    const existingCode = db
      .prepare('SELECT id FROM products WHERE code = ?')
      .get(productCode);

    if (existingCode) {
      return reply.code(400).send({ error: 'Product code already exists' });
    }

    db.prepare(
      'INSERT INTO products (id, name, code, description, created_by) VALUES (?, ?, ?, ?, ?)',
    ).run(id, name, productCode, description ?? null, request.user.id);

    const product = db
      .prepare('SELECT id, name, code, description, created_by, created_at FROM products WHERE id = ?')
      .get(id);

    return reply.code(201).send(product);
  });

  // PUT /api/products/:id - 更新產品
  fastify.put<{
    Params: { id: string };
    Body: { name?: string; code?: string; description?: string };
  }>('/api/products/:id', async (request, reply) => {
    const { id } = request.params;
    const { name, code, description } = request.body;
    const db = getDb();

    const existing = db
      .prepare('SELECT id, name, code, description FROM products WHERE id = ?')
      .get(id) as { id: string; name: string; code: string; description: string | null } | undefined;

    if (!existing) {
      return reply.code(404).send({ error: 'Product not found' });
    }

    // name 不可重複（排除自己）
    if (name && name !== existing.name) {
      const duplicate = db
        .prepare('SELECT id FROM products WHERE name = ? AND id != ?')
        .get(name, id);

      if (duplicate) {
        return reply.code(400).send({ error: 'Product name already exists' });
      }
    }

    // code 不可重複（排除自己）
    if (code && code !== existing.code) {
      const duplicate = db
        .prepare('SELECT id FROM products WHERE code = ? AND id != ?')
        .get(code, id);

      if (duplicate) {
        return reply.code(400).send({ error: 'Product code already exists' });
      }
    }

    db.prepare(
      'UPDATE products SET name = ?, code = ?, description = ? WHERE id = ?',
    ).run(
      name ?? existing.name,
      code ?? existing.code,
      description !== undefined ? description : existing.description,
      id,
    );

    const updated = db
      .prepare('SELECT id, name, code, description, created_by, created_at FROM products WHERE id = ?')
      .get(id);

    return reply.send(updated);
  });

  // DELETE /api/products/:id - 刪除產品
  fastify.delete<{
    Params: { id: string };
  }>('/api/products/:id', async (request, reply) => {
    const { id } = request.params;
    const db = getDb();

    const existing = db
      .prepare('SELECT id FROM products WHERE id = ?')
      .get(id);

    if (!existing) {
      return reply.code(404).send({ error: 'Product not found' });
    }

    // 如有專案使用中則回傳 400
    const projectCount = db
      .prepare('SELECT COUNT(*) as count FROM projects WHERE product_id = ?')
      .get(id) as { count: number };

    if (projectCount.count > 0) {
      return reply.code(400).send({ error: 'Cannot delete product with associated projects' });
    }

    db.prepare('DELETE FROM products WHERE id = ?').run(id);

    return reply.send({ message: 'Product deleted' });
  });
}
