import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../db/connection.js';
import { GiteaService } from '../services/giteaService.js';

/** 取得全域 Gitea connection（不分使用者） */
function getGlobalConnection() {
  const db = getDb();
  return db
    .prepare('SELECT * FROM gitea_connections ORDER BY id DESC LIMIT 1')
    .get() as
    | {
        id: number;
        user_id: number;
        gitea_url: string;
        access_token: string;
        gitea_username: string | null;
      }
    | undefined;
}

/** 建立一個已認證的 GiteaService 實例（全域） */
function createGiteaService(): GiteaService {
  const conn = getGlobalConnection();
  if (!conn) {
    throw new Error('尚未連接 Gitea，請先在設定頁面連接');
  }
  return new GiteaService(conn.gitea_url, conn.access_token);
}

export default async function giteaRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── 連接管理 ───

  /** POST /api/gitea/connect — 使用 Personal Access Token 連接 */
  fastify.post<{
    Body: { giteaUrl: string; token: string };
  }>('/api/gitea/connect', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { giteaUrl, token } = request.body as any;

    if (!giteaUrl || !token) {
      return reply.status(400).send({ error: '請提供 Gitea URL 及 Personal Access Token' });
    }

    try {
      // 驗證 token 有效
      const gitea = new GiteaService(giteaUrl, token);
      const user = await gitea.verifyToken();

      // 存入 DB（全域只保留一組，先清空再新增）
      const db = getDb();
      db.prepare('DELETE FROM gitea_connections').run();

      db.prepare(
        `INSERT INTO gitea_connections (user_id, gitea_url, access_token, gitea_username)
         VALUES (0, ?, ?, ?)`,
      ).run(giteaUrl.replace(/\/+$/, ''), token, user.login);

      return {
        success: true,
        username: user.login,
        userId: user.id,
      };
    } catch (err: any) {
      return reply.status(400).send({
        error: `Token 驗證失敗：${err.message}`,
      });
    }
  });

  /** DELETE /api/gitea/disconnect — 斷開連接 */
  fastify.delete('/api/gitea/disconnect', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const db = getDb();
    db.prepare('DELETE FROM gitea_connections').run();
    return { success: true };
  });

  /** GET /api/gitea/status — 連接狀態 */
  fastify.get('/api/gitea/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const conn = getGlobalConnection();
    if (!conn) {
      return { connected: false, username: null };
    }

    // 驗證 token 是否仍有效
    try {
      const gitea = new GiteaService(conn.gitea_url, conn.access_token);
      const user = await gitea.verifyToken();
      return {
        connected: true,
        username: user.login,
        gitea_url: conn.gitea_url,
      };
    } catch {
      return { connected: false, username: conn.gitea_username, tokenExpired: true };
    }
  });

  // ─── Organization 操作 ───

  /** GET /api/gitea/orgs — 列出使用者的 organizations */
  fastify.get('/api/gitea/orgs', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const gitea = createGiteaService();
      const orgs = await gitea.listOrgs();
      return orgs.map((o) => ({
        username: o.username,
        full_name: o.full_name,
        avatar_url: o.avatar_url,
      }));
    } catch (err: any) {
      return reply.status(502).send({ error: err.message });
    }
  });

  /** GET /api/gitea/orgs/:org/projects — 列出 org 的 project boards */
  fastify.get<{
    Params: { org: string };
  }>('/api/gitea/orgs/:org/projects', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { org } = request.params;

    try {
      const gitea = createGiteaService();
      const projects = await gitea.listOrgProjects(org);
      return projects.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
      }));
    } catch (err: any) {
      return reply.status(502).send({ error: err.message });
    }
  });

  /** GET /api/gitea/orgs/:org/repos — 列出 org 的 repos */
  fastify.get<{
    Params: { org: string };
  }>('/api/gitea/orgs/:org/repos', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { org } = request.params;

    try {
      const gitea = createGiteaService();
      const repos = await gitea.listOrgRepos(org);
      return repos.map((r) => ({
        full_name: r.full_name,
        name: r.name,
        description: r.description,
      }));
    } catch (err: any) {
      return reply.status(502).send({ error: err.message });
    }
  });

  /** POST /api/gitea/orgs/:org/repos — 在 org 底下建立 repo */
  fastify.post<{
    Params: { org: string };
    Body: { name: string; description?: string };
  }>('/api/gitea/orgs/:org/repos', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { org } = request.params;
    const { name, description } = request.body as any;

    if (!name || !name.trim()) {
      return reply.status(400).send({ error: '請輸入 Repository 名稱' });
    }

    try {
      const gitea = createGiteaService();
      const repo = await gitea.createOrgRepo(org, name.trim(), description);
      return reply.status(201).send({
        full_name: repo.full_name,
        name: repo.name,
        html_url: repo.html_url,
      });
    } catch (err: any) {
      return reply.status(502).send({ error: err.message });
    }
  });

  /** GET /api/gitea/repos/all — 列出使用者所有有權限的 repos */
  fastify.get('/api/gitea/repos/all', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const gitea = createGiteaService();
      const repos = await gitea.listAllRepos();
      return repos.map((r) => ({
        full_name: r.full_name,
        name: r.name,
        description: r.description,
        owner: r.owner?.login,
      }));
    } catch (err: any) {
      return reply.status(502).send({ error: err.message });
    }
  });

  /** GET /api/gitea/orgs/:org/members — 列出 org 成員 */
  fastify.get<{
    Params: { org: string };
  }>('/api/gitea/orgs/:org/members', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { org } = request.params;

    try {
      const gitea = createGiteaService();
      const members = await gitea.listOrgMembers(org);
      return members.map((m) => ({
        login: m.login,
        id: m.id,
        avatar_url: m.avatar_url,
      }));
    } catch (err: any) {
      return reply.status(502).send({ error: err.message });
    }
  });

  // ─── Issue 操作 ───

  /** POST /api/gitea/issues — 建立單一 Issue（到指定 repo）+ 加到 project board */
  fastify.post<{
    Body: {
      repo: string;
      title: string;
      body: string;
      assignees?: string[];
      projectId?: number;
    };
  }>('/api/gitea/issues', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { repo, title, body, assignees, projectId } = request.body as any;

    if (!repo || !title) {
      return reply.status(400).send({ error: '缺少必要參數: repo, title' });
    }

    const [owner, repoName] = repo.split('/');
    if (!owner || !repoName) {
      return reply.status(400).send({ error: 'repo 格式應為 owner/repo' });
    }

    try {
      const gitea = createGiteaService();

      // 確保 bug label 存在
      const bugLabelId = await gitea.ensureBugLabel(owner, repoName);

      // 建立 issue
      const issue = await gitea.createIssue(owner, repoName, {
        title,
        body: body || '',
        labels: [bugLabelId],
        assignees: assignees || [],
      });

      // 如果指定了 projectId，嘗試加入 project board
      if (projectId) {
        await gitea.addIssueToProjectBoard(projectId, issue.id);
      }

      // 記錄到 DB
      const db = getDb();
      db.prepare(
        'INSERT INTO gitea_issues (gitea_issue_number, gitea_issue_url, gitea_repo) VALUES (?, ?, ?)',
      ).run(issue.number, issue.html_url, repo);

      return {
        success: true,
        issue: {
          number: issue.number,
          url: issue.html_url,
        },
      };
    } catch (err: any) {
      return reply.status(502).send({ error: err.message });
    }
  });

  /** POST /api/gitea/issues/batch — 批次建立 Issues */
  fastify.post<{
    Body: {
      repo: string;
      bugs: Array<{
        id?: number;
        title: string;
        body: string;
        executionId?: number;
      }>;
      projectId?: number;
      assignee?: string;
    };
  }>('/api/gitea/issues/batch', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { repo, bugs, projectId, assignee } = request.body as any;

    if (!repo || !Array.isArray(bugs) || bugs.length === 0) {
      return reply.status(400).send({ error: '缺少必要參數: repo, bugs' });
    }

    const [owner, repoName] = repo.split('/');
    if (!owner || !repoName) {
      return reply.status(400).send({ error: 'repo 格式應為 owner/repo' });
    }

    try {
      const gitea = createGiteaService();
      const db = getDb();

      // 確保 bug label 存在
      const bugLabelId = await gitea.ensureBugLabel(owner, repoName);

      const results: Array<{
        bugId?: number;
        issueNumber: number;
        issueUrl: string;
        success: boolean;
        error?: string;
      }> = [];

      const insertStmt = db.prepare(
        'INSERT INTO gitea_issues (bug_id, execution_id, gitea_issue_number, gitea_issue_url, gitea_repo) VALUES (?, ?, ?, ?, ?)',
      );

      for (const bug of bugs) {
        try {
          const issue = await gitea.createIssue(owner, repoName, {
            title: bug.title,
            body: bug.body || '',
            labels: [bugLabelId],
            assignees: assignee ? [assignee] : [],
          });

          // 記錄到 DB
          insertStmt.run(
            bug.id ?? null,
            bug.executionId ?? null,
            issue.number,
            issue.html_url,
            repo,
          );

          // 加入 project board
          if (projectId) {
            await gitea.addIssueToProjectBoard(projectId, issue.id);
          }

          results.push({
            bugId: bug.id,
            issueNumber: issue.number,
            issueUrl: issue.html_url,
            success: true,
          });
        } catch (err: any) {
          results.push({
            bugId: bug.id,
            issueNumber: 0,
            issueUrl: '',
            success: false,
            error: err.message,
          });
        }
      }

      return {
        total: bugs.length,
        created: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      };
    } catch (err: any) {
      return reply.status(502).send({ error: err.message });
    }
  });
}
