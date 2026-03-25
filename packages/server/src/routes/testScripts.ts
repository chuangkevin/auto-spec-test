import { FastifyInstance, FastifyRequest } from 'fastify';
import { getDb } from '../db/connection.js';
import { generateTestScript } from '../services/aiService.js';

export default async function testScriptRoutes(fastify: FastifyInstance) {
  // Generate test script from specification outline
  fastify.post(
    '/api/projects/:projectId/test-scripts/generate',
    async (
      request: FastifyRequest<{
        Params: { projectId: string };
        Body: { specificationId: number };
      }>,
      reply
    ) => {
      const db = getDb();
      const projectId = request.params.projectId;
      const { specificationId } = request.body as any;

      // Get project with product name
      const project = db
        .prepare(
          `SELECT p.id, p.name, pr.name as product_name
           FROM projects p
           JOIN products pr ON p.product_id = pr.id
           WHERE p.id = ?`
        )
        .get(projectId) as any;
      if (!project) {
        return reply.status(404).send({ error: '專案不存在' });
      }

      // Get specification outline
      const spec = db
        .prepare(
          'SELECT parsed_outline_md FROM specifications WHERE id = ? AND project_id = ?'
        )
        .get(specificationId, projectId) as any;
      if (!spec) {
        return reply.status(404).send({ error: '規格書不存在' });
      }
      if (!spec.parsed_outline_md) {
        return reply
          .status(400)
          .send({ error: '規格書尚未解析，請先執行解析。' });
      }

      // Call AI to generate test script
      let scriptMd: string;
      try {
        scriptMd = await generateTestScript(
          spec.parsed_outline_md,
          project.product_name,
          projectId
        );
      } catch (err: any) {
        return reply
          .status(500)
          .send({ error: `AI 產出腳本失敗: ${err.message}` });
      }

      // Get next version
      const latest = db
        .prepare(
          'SELECT MAX(version) as maxVersion FROM test_scripts WHERE project_id = ?'
        )
        .get(projectId) as any;
      const version = (latest?.maxVersion || 0) + 1;

      // Insert test script
      const result = db
        .prepare(
          `INSERT INTO test_scripts (specification_id, project_id, content_md, version)
           VALUES (?, ?, ?, ?)`
        )
        .run(specificationId, projectId, scriptMd, version);

      // Update project status
      db.prepare("UPDATE projects SET status = 'has_script', updated_at = datetime('now') WHERE id = ?").run(
        projectId
      );

      return reply.status(201).send({
        id: result.lastInsertRowid,
        projectId,
        specificationId,
        version,
        contentMd: scriptMd,
      });
    }
  );

  // Get test scripts for a project (version history)
  fastify.get(
    '/api/projects/:projectId/test-scripts',
    async (request: FastifyRequest<{ Params: { projectId: string } }>) => {
      const db = getDb();
      const projectId = request.params.projectId;

      const scripts = db
        .prepare(
          `SELECT id, specification_id, project_id, version, created_at
           FROM test_scripts WHERE project_id = ? ORDER BY version DESC`
        )
        .all(projectId);

      return scripts;
    }
  );

  // Get specific test script
  fastify.get(
    '/api/projects/:projectId/test-scripts/:id',
    async (
      request: FastifyRequest<{ Params: { projectId: string; id: string } }>,
      reply
    ) => {
      const db = getDb();
      const projectId = request.params.projectId;
      const id = request.params.id;

      const script = db
        .prepare(
          'SELECT * FROM test_scripts WHERE id = ? AND project_id = ?'
        )
        .get(id, projectId) as any;
      if (!script) {
        return reply.status(404).send({ error: '測試腳本不存在' });
      }

      return script;
    }
  );

  // Get latest test script
  fastify.get(
    '/api/projects/:projectId/test-scripts/latest',
    async (
      request: FastifyRequest<{ Params: { projectId: string } }>,
      reply
    ) => {
      const db = getDb();
      const projectId = request.params.projectId;

      const script = db
        .prepare(
          'SELECT * FROM test_scripts WHERE project_id = ? ORDER BY version DESC LIMIT 1'
        )
        .get(projectId) as any;
      if (!script) {
        return reply.status(404).send({ error: '尚無測試腳本' });
      }

      return script;
    }
  );

  // Update test script (creates new version)
  fastify.put(
    '/api/projects/:projectId/test-scripts/:id',
    async (
      request: FastifyRequest<{
        Params: { projectId: string; id: string };
        Body: { contentMd: string };
      }>,
      reply
    ) => {
      const db = getDb();
      const projectId = request.params.projectId;
      const id = request.params.id;
      const { contentMd } = request.body as any;

      // Get current script to get specification_id
      const current = db
        .prepare(
          'SELECT specification_id FROM test_scripts WHERE id = ? AND project_id = ?'
        )
        .get(id, projectId) as any;
      if (!current) {
        return reply.status(404).send({ error: '測試腳本不存在' });
      }

      // Get next version
      const latest = db
        .prepare(
          'SELECT MAX(version) as maxVersion FROM test_scripts WHERE project_id = ?'
        )
        .get(projectId) as any;
      const version = (latest?.maxVersion || 0) + 1;

      // Insert new version
      const result = db
        .prepare(
          `INSERT INTO test_scripts (specification_id, project_id, content_md, version)
           VALUES (?, ?, ?, ?)`
        )
        .run(current.specification_id, projectId, contentMd, version);

      db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(
        projectId
      );

      return reply.status(201).send({
        id: result.lastInsertRowid,
        projectId,
        version,
        contentMd,
      });
    }
  );

  // Download test script as .md
  fastify.get(
    '/api/projects/:projectId/test-scripts/:id/download',
    async (
      request: FastifyRequest<{ Params: { projectId: string; id: string } }>,
      reply
    ) => {
      const db = getDb();
      const projectId = request.params.projectId;
      const id = request.params.id;

      const script = db
        .prepare(
          'SELECT ts.content_md, p.name as project_name, ts.version FROM test_scripts ts JOIN projects p ON ts.project_id = p.id WHERE ts.id = ? AND ts.project_id = ?'
        )
        .get(id, projectId) as any;
      if (!script) {
        return reply.status(404).send({ error: '測試腳本不存在' });
      }

      const filename = `${script.project_name}-test-script-v${script.version}.md`;

      return reply
        .header('Content-Type', 'text/markdown; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
        .send(script.content_md);
    }
  );
}
