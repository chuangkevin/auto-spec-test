/**
 * Gitea API v1 封裝
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

  /** 取得目前使用者資訊 */
  async getCurrentUser(): Promise<{ login: string; id: number }> {
    return this.request('GET', '/user');
  }

  /** 取得使用者的 repo 列表 */
  async listRepos(page = 1, limit = 50): Promise<Array<{ full_name: string; description: string }>> {
    return this.request('GET', `/user/repos?page=${page}&limit=${limit}`);
  }

  /** 取得 repo 成員（collaborators） */
  async getRepoMembers(
    owner: string,
    repo: string,
  ): Promise<Array<{ login: string; id: number }>> {
    return this.request('GET', `/repos/${owner}/${repo}/collaborators`);
  }

  /** 建立 Issue */
  async createIssue(
    owner: string,
    repo: string,
    data: {
      title: string;
      body: string;
      labels?: number[];
      assignees?: string[];
    },
  ): Promise<{ number: number; html_url: string }> {
    return this.request('POST', `/repos/${owner}/${repo}/issues`, data);
  }

  /** 確保 "bug" label 存在，回傳 label id */
  async ensureBugLabel(owner: string, repo: string): Promise<number> {
    // 先列出現有 labels
    const labels = await this.request<Array<{ id: number; name: string }>>(
      'GET',
      `/repos/${owner}/${repo}/labels`,
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
      `/repos/${owner}/${repo}/labels`,
      { name: 'bug', color: '#ee0701', description: 'Bug report' },
    );
    return created.id;
  }

  /** 建立 Repo Project（Gitea 1.20+） */
  async createProject(
    owner: string,
    repo: string,
    title: string,
  ): Promise<{ id: number }> {
    try {
      return await this.request('POST', `/repos/${owner}/${repo}/projects`, {
        title,
        board_type: 1, // basic kanban
      });
    } catch (err) {
      // Gitea 版本可能不支援 project API，回傳 fallback
      console.warn('[GiteaService] createProject failed (API may not be supported):', err);
      throw err;
    }
  }

  /** 把 Issue 加到 Project（Gitea 1.20+） */
  async addIssueToProject(
    owner: string,
    repo: string,
    projectId: number,
    issueId: number,
  ): Promise<void> {
    try {
      await this.request(
        'POST',
        `/repos/${owner}/${repo}/projects/${projectId}/issues`,
        { issue_id: issueId },
      );
    } catch (err) {
      console.warn('[GiteaService] addIssueToProject failed:', err);
      // Non-critical, don't re-throw
    }
  }
}
