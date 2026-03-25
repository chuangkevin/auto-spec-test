/**
 * Gitea API v1 封裝 — Organization-level Personal Access Token 模式
 */
export class GiteaService {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    // Remove trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const headers: Record<string, string> = {
      Authorization: `token ${this.token}`,
      'Content-Type': 'application/json',
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gitea API ${method} ${path} failed (${res.status}): ${text}`);
    }

    // Some endpoints return 204 No Content
    if (res.status === 204) {
      return undefined as T;
    }

    return res.json() as Promise<T>;
  }

  /** 驗證 token 有效，取得目前使用者資訊 */
  async verifyToken(): Promise<{ login: string; id: number }> {
    return this.request('GET', '/user');
  }

  /** 取得使用者所屬的 organizations */
  async listOrgs(): Promise<Array<{ username: string; full_name: string; avatar_url: string }>> {
    return this.request('GET', '/user/orgs');
  }

  /** 取得 organization 的 project boards */
  async listOrgProjects(org: string): Promise<Array<{ id: number; title: string; description: string }>> {
    try {
      // Gitea 1.20+ 支援 org-level projects
      return await this.request('GET', `/orgs/${encodeURIComponent(org)}/projects`);
    } catch {
      // fallback: 某些版本可能不支援，回傳空陣列
      console.warn(`[GiteaService] listOrgProjects for ${org} failed, returning empty array`);
      return [];
    }
  }

  /** 取得 organization 的 repos */
  async listOrgRepos(org: string, page = 1, limit = 50): Promise<Array<{ full_name: string; name: string; description: string }>> {
    return this.request('GET', `/orgs/${encodeURIComponent(org)}/repos?page=${page}&limit=${limit}`);
  }

  /** 取得 org 成員 */
  async listOrgMembers(org: string): Promise<Array<{ login: string; id: number; avatar_url: string }>> {
    return this.request('GET', `/orgs/${encodeURIComponent(org)}/members`);
  }

  /** 在 repo 建立 Issue */
  async createIssue(
    owner: string,
    repo: string,
    data: {
      title: string;
      body: string;
      labels?: number[];
      assignees?: string[];
    },
  ): Promise<{ number: number; html_url: string; id: number }> {
    return this.request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`, data);
  }

  /** 取得 Project Board 的 columns */
  async getProjectColumns(projectId: number): Promise<Array<{ id: number; title: string }>> {
    try {
      return await this.request('GET', `/projects/${projectId}/columns`);
    } catch {
      console.warn(`[GiteaService] getProjectColumns for project ${projectId} failed`);
      return [];
    }
  }

  /** 把 Issue 加到 Project Board（透過 column） */
  async addIssueToProjectBoard(projectId: number, issueId: number): Promise<void> {
    try {
      // 取得第一個 column（通常是「待處理」或「To Do」）
      const columns = await this.getProjectColumns(projectId);
      if (columns.length === 0) {
        console.warn(`[GiteaService] No columns found for project ${projectId}`);
        return;
      }
      const columnId = columns[0].id;
      await this.request('POST', `/projects/${projectId}/columns/${columnId}/issues`, {
        issue_id: issueId,
      });
    } catch (err) {
      console.warn('[GiteaService] addIssueToProjectBoard failed:', err);
      // Non-critical, don't re-throw
    }
  }

  /** 在 organization 底下建立 repo */
  async createOrgRepo(
    org: string,
    name: string,
    description?: string,
  ): Promise<{ full_name: string; name: string; html_url: string }> {
    return this.request('POST', `/orgs/${encodeURIComponent(org)}/repos`, {
      name,
      description: description || '由 Auto Spec Test 建立的測試 Issues 專用 Repository',
      private: false,
      auto_init: true,
      default_branch: 'main',
      has_issues: true,
      has_projects: true,
    });
  }

  /** 取得所有使用者有權限的 repos（含各 org 的） */
  async listAllRepos(page = 1, limit = 50): Promise<Array<{ full_name: string; name: string; description: string; owner: { login: string } }>> {
    return this.request('GET', `/user/repos?page=${page}&limit=${limit}`);
  }

  /** 確保 "bug" label 存在，回傳 label id */
  async ensureBugLabel(owner: string, repo: string): Promise<number> {
    const labels = await this.request<Array<{ id: number; name: string }>>(
      'GET',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels`,
    );

    const existing = labels.find(
      (l) => l.name.toLowerCase() === 'bug',
    );
    if (existing) {
      return existing.id;
    }

    // 建立新 label
    const created = await this.request<{ id: number }>(
      'POST',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels`,
      { name: 'bug', color: '#ee0701', description: 'Bug report' },
    );
    return created.id;
  }
}
