import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../db/connection.js';
import { GiteaService } from '../services/giteaService.js';

/** 從 settings 表讀取 Gitea 設定 */
function getGiteaSettings(): {
  giteaUrl: string;
  clientId: string;
  clientSecret: string;
} {
  const db = getDb();
  const rows = db
    .prepare("SELECT key, value FROM settings WHERE key IN ('gitea_url', 'gitea_client_id', 'gitea_client_secret')")
    .all() as Array<{ key: string; value: string }>;

  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }

  if (!map.gitea_url || !map.gitea_client_id || !map.gitea_client_secret) {
    throw new Error('Gitea OAuth 設定不完整，請先在設定頁面填入 gitea_url、gitea_client_id、gitea_client_secret');
  }

  return {
    giteaUrl: map.gitea_url.replace(/\/+$/, ''),
    clientId: map.gitea_client_id,
    clientSecret: map.gitea_client_secret,
  };
}

/** 取得使用者的 Gitea connection */
function getUserConnection(userId: number) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM gitea_connections WHERE user_id = ? ORDER BY id DESC LIMIT 1')
    .get(userId) as
    | {
        id: number;
        user_id: number;
        gitea_url: string;
        access_token: string;
        refresh_token: string | null;
        token_expires_at: string | null;
        gitea_username: string | null;
      }
    | undefined;
}

/** 建立一個已認證的 GiteaService 實例 */
function createGiteaService(userId: number): GiteaService {
  const conn = getUserConnection(userId);
  if (!conn) {
    throw new Error('尚未連接 Gitea，請先進行 OAuth 授權');
  }
  return new GiteaService(conn.gitea_url, conn.access_token);
}

export default async function giteaRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── OAuth2 流程 ───

  /** GET /api/gitea/auth-url → 回傳授權 URL */
  fastify.get('/api/gitea/auth-url', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { giteaUrl, clientId } = getGiteaSettings();
      const redirectUri = `${request.protocol}://${request.hostname}/api/gitea/callback`;

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        state: String((request as any).user?.id ?? ''),
      });

      const url = `${giteaUrl}/login/oauth/authorize?${params.toString()}`;
      return { url };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /** GET /api/gitea/callback?code=xxx&state=userId → OAuth callback */
  fastify.get<{
    Querystring: { code?: string; state?: string };
  }>('/api/gitea/callback', async (request, reply) => {
    const { code, state } = request.query;

    if (!code) {
      return reply.status(400).send({ error: '缺少 authorization code' });
    }

    try {
      const { giteaUrl, clientId, clientSecret } = getGiteaSettings();
      const redirectUri = `${request.protocol}://${request.hostname}/api/gitea/callback`;

      // 用 code 換 access_token
      const tokenRes = await fetch(`${giteaUrl}/login/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenRes.ok) {
        const text = await tokenRes.text().catch(() => '');
        return reply.status(502).send({
          error: `Gitea token exchange failed (${tokenRes.status}): ${text}`,
        });
      }

      const tokenData = (await tokenRes.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        token_type: string;
      };

      if (!tokenData.access_token) {
        return reply.status(502).send({ error: 'Gitea 未回傳 access_token' });
      }

      // 用 token 取得使用者資訊
      const gitea = new GiteaService(giteaUrl, tokenData.access_token);
      const giteaUser = await gitea.getCurrentUser();

      // 從 state 取得 userId
      const userId = Number(state);
      if (!userId) {
        return reply.status(400).send({ error: '無法辨識使用者，state 無效' });
      }

      // 存入 DB（先刪舊的再建新的）
      const db = getDb();
      db.prepare('DELETE FROM gitea_connections WHERE user_id = ?').run(userId);

      const expiresAt = tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null;

      db.prepare(
        `INSERT INTO gitea_connections (user_id, gitea_url, access_token, refresh_token, token_expires_at, gitea_username)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        userId,
        giteaUrl,
        tokenData.access_token,
        tokenData.refresh_token ?? null,
        expiresAt,
        giteaUser.login,
      );

      // Redirect 回前端設定頁
      return reply.redirect('/settings?gitea=connected');
    } catch (err: any) {
      console.error('[Gitea callback error]', err);
      return reply.redirect(`/settings?gitea=error&message=${encodeURIComponent(err.message)}`);
    }
  });

  /** GET /api/gitea/status → 檢查連接狀態 */
  fastify.get('/api/gitea/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const conn = getUserConnection(userId);
    if (!conn) {
      return { connected: false, username: null };
    }

    // 驗證 token 是否仍有效
    try {
      const gitea = new GiteaService(conn.gitea_url, conn.access_token);
      const user = await gitea.getCurrentUser();
      return { connected: true, username: user.login };
    } catch {
      return { connected: false, username: conn.gitea_username, tokenExpired: true };
    }
  });

  /** DELETE /api/gitea/disconnect → 斷開連接 */
  fastify.delete('/api/gitea/disconnect', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const db = getDb();
    db.prepare('DELETE FROM gitea_connections WHERE user_id = ?').run(userId);
    return { success: true };
  });

  // ─── Repo 操作 ───

  /** GET /api/gitea/repos → 列出有權限的 repos */
  fastify.get('/api/gitea/repos', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const gitea = createGiteaService(userId);
      const repos = await gitea.listRepos();
      return repos.map((r) => ({
        full_name: r.full_name,
        description: r.description,
      }));
    } catch (err: any) {
      return reply.status(502).send({ error: err.message });
    }
  });

  /** GET /api/gitea/repos/:owner/:repo/members → repo 成員 */
  fastify.get<{
    Params: { owner: string; repo: string };
  }>('/api/gitea/repos/:owner/:repo/members', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { owner, repo } = request.params;

    try {
      const gitea = createGiteaService(userId);
      const members = await gitea.getRepoMembers(owner, repo);
      return members.map((m) => ({ login: m.login, id: m.id }));
    } catch (err: any) {
      return reply.status(502).send({ error: err.message });
    }
  });

  // ─── Issue 操作 ───

  /** POST /api/gitea/issues → 建立單一 Issue */
  fastify.post<{
    Body: {
      repo: string;
      title: string;
      body: string;
      assignees?: string[];
      projectName?: string;
    };
  }>('/api/gitea/issues', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { repo, title, body, assignees, projectName } = request.body as any;

    if (!repo || !title) {
      return reply.status(400).send({ error: '缺少必要參數: repo, title' });
    }

    const [owner, repoName] = repo.split('/');
    if (!owner || !repoName) {
      return reply.status(400).send({ error: 'repo 格式應為 owner/repo' });
    }

    try {
      const gitea = createGiteaService(userId);

      // 確保 bug label 存在
      const bugLabelId = await gitea.ensureBugLabel(owner, repoName);

      // 建立 issue
      const issue = await gitea.createIssue(owner, repoName, {
        title,
        body: body || '',
        labels: [bugLabelId],
        assignees: assignees || [],
      });

      // 如果指定了 projectName，嘗試建立 project 並加入 issue
      if (projectName) {
        try {
          const project = await gitea.createProject(owner, repoName, projectName);
          await gitea.addIssueToProject(owner, repoName, project.id, issue.number);
        } catch {
          // Project API 可能不支援，忽略
        }
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

  /** POST /api/gitea/issues/batch → 批次建立 Issues */
  fastify.post<{
    Body: {
      repo: string;
      bugs: Array<{
        id?: number;
        title: string;
        body: string;
        executionId?: number;
      }>;
      projectName?: string;
      assignee?: string;
    };
  }>('/api/gitea/issues/batch', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { repo, bugs, projectName, assignee } = request.body as any;

    if (!repo || !Array.isArray(bugs) || bugs.length === 0) {
      return reply.status(400).send({ error: '缺少必要參數: repo, bugs' });
    }

    const [owner, repoName] = repo.split('/');
    if (!owner || !repoName) {
      return reply.status(400).send({ error: 'repo 格式應為 owner/repo' });
    }

    try {
      const gitea = createGiteaService(userId);
      const db = getDb();

      // 確保 bug label 存在
      const bugLabelId = await gitea.ensureBugLabel(owner, repoName);

      // 嘗試建立 project
      let projectId: number | null = null;
      if (projectName) {
        try {
          const project = await gitea.createProject(owner, repoName, projectName);
          projectId = project.id;
        } catch {
          // Project API 可能不支援
        }
      }

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

          // 加入 project
          if (projectId) {
            await gitea.addIssueToProject(owner, repoName, projectId, issue.number);
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
