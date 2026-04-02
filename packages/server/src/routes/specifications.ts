import { FastifyInstance, FastifyRequest } from 'fastify';
import path from 'path';
import { randomUUID } from 'crypto';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { fileURLToPath } from 'url';
import { getDb } from '../db/connection.js';
import { parseMultipleFiles } from '../services/fileParser.js';
import { parseSpecification } from '../services/aiService.js';
import { skillService } from '../services/skillService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

const ALLOWED_EXTENSIONS = ['.md', '.docx', '.xls', '.xlsx', '.csv', '.json', '.txt'];
const MAX_FILES = 20;

export default async function specificationRoutes(fastify: FastifyInstance) {
  // Upload specification files
  fastify.post(
    '/api/projects/:projectId/specifications/upload',
    async (request: FastifyRequest<{ Params: { projectId: string } }>, reply) => {
      const db = getDb();
      const projectId = request.params.projectId;

      // Check project exists
      const project = db
        .prepare('SELECT id FROM projects WHERE id = ?')
        .get(projectId) as any;
      if (!project) {
        return reply.status(404).send({ error: '專案不存在' });
      }

      const parts = request.parts();
      const savedFiles: Array<{ name: string; path: string; size: number; type: string }> =
        [];

      const projectUploadDir = path.join(UPLOADS_DIR, String(projectId));
      await mkdir(projectUploadDir, { recursive: true });

      let fileCount = 0;
      for await (const part of parts) {
        if (part.type !== 'file' || !part.filename) continue;

        fileCount++;
        if (fileCount > MAX_FILES) {
          return reply.status(400).send({ error: `單次上傳不可超過 ${MAX_FILES} 個檔案` });
        }

        const ext = path.extname(part.filename).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          return reply
            .status(400)
            .send({ error: `不支援的檔案格式: ${ext}，支援: ${ALLOWED_EXTENSIONS.join(', ')}` });
        }

        const uniqueName = `${randomUUID()}${ext}`;
        const filePath = path.join(projectUploadDir, uniqueName);
        const buffer = await part.toBuffer();

        await writeFile(filePath, buffer);

        savedFiles.push({
          name: part.filename,
          path: filePath,
          size: buffer.length,
          type: ext,
        });
      }

      if (savedFiles.length === 0) {
        return reply.status(400).send({ error: '請至少上傳一個檔案' });
      }

      // 如果已有 spec，merge 新檔案到現有 spec；否則建立新的
      const existingSpec = db
        .prepare('SELECT id, original_files, version FROM specifications WHERE project_id = ? ORDER BY version DESC LIMIT 1')
        .get(projectId) as { id: number; original_files: string; version: number } | undefined;

      let specId: number | bigint;
      let version: number;
      let allFiles: typeof savedFiles;

      if (existingSpec) {
        // Merge: 把新檔案加到現有 spec
        const existingFiles = JSON.parse(existingSpec.original_files) as typeof savedFiles;
        allFiles = [...existingFiles, ...savedFiles];
        version = existingSpec.version;
        specId = existingSpec.id;

        db.prepare(
          `UPDATE specifications SET original_files = ?, parsed_outline_md = NULL, updated_at = datetime('now') WHERE id = ?`
        ).run(JSON.stringify(allFiles), existingSpec.id);
      } else {
        // 新建 spec
        allFiles = savedFiles;
        version = 1;
        const result = db
          .prepare(
            `INSERT INTO specifications (project_id, original_files, version, uploaded_by)
             VALUES (?, ?, ?, ?)`
          )
          .run(projectId, JSON.stringify(savedFiles), 1, (request.user as any).id);
        specId = result.lastInsertRowid;
      }

      return reply.status(201).send({
        id: specId,
        projectId,
        files: allFiles.map((f) => ({ name: f.name, size: f.size, type: f.type })),
        version,
      });
    }
  );

  // Parse specification and generate outline
  fastify.post(
    '/api/projects/:projectId/specifications/:specId/parse',
    async (
      request: FastifyRequest<{ Params: { projectId: string; specId: string } }>,
      reply
    ) => {
      const db = getDb();
      const projectId = request.params.projectId;
      const specId = request.params.specId;

      const spec = db
        .prepare('SELECT * FROM specifications WHERE id = ? AND project_id = ?')
        .get(specId, projectId) as any;
      if (!spec) {
        return reply.status(404).send({ error: '規格書不存在' });
      }

      const files: Array<{ name: string; path: string; type: string }> = JSON.parse(
        spec.original_files
      );

      // Parse all uploaded files to text
      let rawText: string;
      try {
        rawText = await parseMultipleFiles(files);
      } catch (err: any) {
        return reply
          .status(400)
          .send({ error: `檔案解析失敗: ${err.message}` });
      }

      if (!rawText.trim()) {
        return reply
          .status(400)
          .send({ error: '規格書內容為空，請確認上傳的檔案是否包含有效內容。' });
      }

      // Call AI to parse specification
      let outlineMd: string;
      try {
        outlineMd = await parseSpecification(rawText, Number(projectId));
      } catch (err: any) {
        return reply
          .status(500)
          .send({ error: `AI 解析失敗: ${err.message}` });
      }

      // Update specification with parsed outline
      db.prepare(
        'UPDATE specifications SET parsed_outline_md = ? WHERE id = ?'
      ).run(outlineMd, specId);

      // 非同步觸發 project skill 生成
      if (outlineMd && outlineMd.length >= 500) {
        skillService.generateFromSpec(Number(projectId), outlineMd).catch(err => {
          console.error('[specifications] skill 生成失敗:', err);
        });
      }

      return { specId, outlineMd };
    }
  );

  // Update outline (user edited)
  fastify.put(
    '/api/projects/:projectId/specifications/:specId/outline',
    async (
      request: FastifyRequest<{
        Params: { projectId: string; specId: string };
        Body: { outlineMd: string };
      }>,
      reply
    ) => {
      const db = getDb();
      const specId = request.params.specId;
      const projectId = request.params.projectId;
      const { outlineMd } = request.body as any;

      const spec = db
        .prepare('SELECT id FROM specifications WHERE id = ? AND project_id = ?')
        .get(specId, projectId) as any;
      if (!spec) {
        return reply.status(404).send({ error: '規格書不存在' });
      }

      db.prepare(
        'UPDATE specifications SET parsed_outline_md = ? WHERE id = ?'
      ).run(outlineMd, specId);

      return { specId, outlineMd };
    }
  );

  // Get specifications for a project
  fastify.get(
    '/api/projects/:projectId/specifications',
    async (request: FastifyRequest<{ Params: { projectId: string } }>) => {
      const db = getDb();
      const projectId = request.params.projectId;

      const specs = db
        .prepare(
          `SELECT id, project_id, original_files, parsed_outline_md, version, uploaded_by, created_at
           FROM specifications WHERE project_id = ? ORDER BY version DESC`
        )
        .all(projectId) as any[];

      return specs.map((s) => ({
        ...s,
        original_files: JSON.parse(s.original_files),
      }));
    }
  );

  // Delete specification
  fastify.delete(
    '/api/projects/:projectId/specifications/:specId',
    async (
      request: FastifyRequest<{ Params: { projectId: string; specId: string } }>,
      reply
    ) => {
      const db = getDb();
      const specId = request.params.specId;
      const projectId = request.params.projectId;

      const spec = db
        .prepare('SELECT * FROM specifications WHERE id = ? AND project_id = ?')
        .get(specId, projectId) as any;
      if (!spec) {
        return reply.status(404).send({ error: '規格書不存在' });
      }

      // Delete uploaded files
      const files: Array<{ path: string }> = JSON.parse(spec.original_files);
      for (const f of files) {
        try {
          await unlink(f.path);
        } catch {
          // ignore if file already deleted
        }
      }

      // Delete specification (CASCADE will delete related test_scripts)
      db.prepare('DELETE FROM specifications WHERE id = ?').run(specId);

      return { success: true };
    }
  );

  // ─── Cross-project specification library ───

  /** GET /api/specifications — 列出所有規格書（跨專案） */
  fastify.get(
    '/api/specifications',
    async (request: FastifyRequest<{ Querystring: { product_id?: string } }>) => {
      const db = getDb();
      const productId = (request.query as any).product_id;

      let sql = `
        SELECT s.id, s.original_files, s.parsed_outline_md, s.version, s.created_at,
               p.id as project_id, p.name as project_name,
               pr.name as product_name,
               u.username as uploaded_by_name
        FROM specifications s
        LEFT JOIN projects p ON s.project_id = p.id
        LEFT JOIN products pr ON p.product_id = pr.id
        LEFT JOIN users u ON s.uploaded_by = u.id
      `;
      const params: any[] = [];
      if (productId) {
        sql += ' WHERE p.product_id = ?';
        params.push(productId);
      }
      sql += ' ORDER BY s.created_at DESC';

      const specs = db.prepare(sql).all(...params) as any[];
      return specs.map((s) => ({
        ...s,
        original_files: JSON.parse(s.original_files || '[]'),
      }));
    }
  );

  /** DELETE /api/specifications/:id — 刪除規格書（跨專案入口） */
  fastify.delete(
    '/api/specifications/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const db = getDb();
      const id = request.params.id;

      const spec = db.prepare('SELECT * FROM specifications WHERE id = ?').get(id) as any;
      if (!spec) return reply.status(404).send({ error: '規格書不存在' });

      const files: Array<{ path: string }> = JSON.parse(spec.original_files || '[]');
      for (const f of files) {
        try { await unlink(f.path); } catch {}
      }

      db.prepare('DELETE FROM specifications WHERE id = ?').run(id);
      return { success: true };
    }
  );
}
