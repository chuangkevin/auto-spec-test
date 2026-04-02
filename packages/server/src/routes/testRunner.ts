import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/connection.js';
import { authHook } from '../middleware/auth.js';
import { browserService } from '../services/browserService.js';
import { explorerService } from '../services/explorerService.js';
import { pageScannerService } from '../services/pageScannerService.js';
import { reportService } from '../services/reportService.js';
import { selfQuestionService } from '../services/selfQuestionService.js';
import { testOrchestrator } from '../services/testOrchestrator.js';
import { skillService } from '../services/skillService.js';

/** 每個 session 的執行狀態 */
interface RunnerState {
  sessionId: string;
  url: string;
  projectId?: number;
  specContent?: string;
  status: 'scanning' | 'ready' | 'running' | 'paused' | 'manual' | 'done' | 'exploring';
  scanResult?: any;
  behaviors?: Array<{
    selector: string;
    type: string;
    description: string;
  }>;
  discussion?: Array<{ role: string; name: string; avatar: string; message: string }>;
  testRunId?: number;
  currentCaseIndex: number;
  paused: boolean;
  skipped: boolean;
  stopped: boolean;
  /** 登入後保存的 session state（cookies + localStorage） */
  savedSessionState?: { cookies: any[]; localStorage: Record<string, string> };
  /** 深度探索產出的頁面地圖 */
  siteMap?: Array<{ url: string; title: string; pageType: string; components: any[]; depth: number; fromUrl?: string; fromLinkText?: string }>;
  /** WebSocket 訊息發送函式 */
  broadcast?: (msg: any) => void;
}

/** 全域 runner 狀態 */
export const runnerStates = new Map<string, RunnerState>();

export default async function testRunnerRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authHook);

  // GET /api/test-runs/check-url — 檢查 URL 是否已有測試記錄/專案
  fastify.get<{
    Querystring: { url: string };
  }>('/api/test-runs/check-url', async (request, reply) => {
    const db = getDb();
    const { url } = request.query as any;
    if (!url) return reply.status(400).send({ error: '請提供 URL' });

    // 找所有符合的 test_runs（URL 完全匹配或前綴匹配）
    const runs = db.prepare(
      `SELECT tr.id, tr.project_id, tr.url, tr.status, tr.total_cases, tr.passed_cases,
              tr.failed_cases, tr.created_at,
              p.name as project_name
       FROM test_runs tr
       LEFT JOIN projects p ON tr.project_id = p.id
       WHERE tr.url = ?
       ORDER BY tr.created_at DESC
       LIMIT 10`
    ).all(url) as any[];

    if (runs.length === 0) {
      return { exists: false };
    }

    // 找出有綁定專案的
    const withProject = runs.filter((r: any) => r.project_id);
    const latestProject = withProject.length > 0 ? {
      id: withProject[0].project_id,
      name: withProject[0].project_name,
    } : null;

    return {
      exists: true,
      project: latestProject,
      testRunCount: runs.length,
      latestRun: {
        id: runs[0].id,
        status: runs[0].status,
        totalCases: runs[0].total_cases,
        passedCases: runs[0].passed_cases,
        failedCases: runs[0].failed_cases,
        createdAt: runs[0].created_at,
      },
    };
  });

  // POST /api/test-runner/start — 開始測試 session
  fastify.post<{
    Body: { url: string; projectId?: number; specContent?: string };
  }>('/api/test-runner/start', async (request, reply) => {
    const { url, projectId, specContent } = request.body;
    if (!url) {
      return reply.status(400).send({ error: '請提供目標 URL' });
    }

    const sessionId = randomUUID();

    try {
      // 傳入正在執行測試的 session IDs，避免驅逐活躍 session
      const activeIds = new Set<string>();
      for (const [id, s] of runnerStates) {
        if (s.status === 'running' || s.status === 'scanning' || s.status === 'exploring') {
          activeIds.add(id);
        }
      }
      await browserService.createSession(sessionId, activeIds);
      await browserService.navigateTo(sessionId, url);
    } catch (err: any) {
      await browserService.closeSession(sessionId);
      return reply.status(500).send({ error: `無法開啟頁面: ${err.message}` });
    }

    const state: RunnerState = {
      sessionId,
      url,
      projectId,
      specContent,
      status: 'ready',
      currentCaseIndex: 0,
      paused: false,
      skipped: false,
      stopped: false,
    };
    runnerStates.set(sessionId, state);

    return { sessionId };
  });

  // GET /api/test-runner/:sessionId/screenshot — 取得目前截圖
  fastify.get<{
    Params: { sessionId: string };
  }>('/api/test-runner/:sessionId/screenshot', async (request, reply) => {
    const { sessionId } = request.params;
    const state = runnerStates.get(sessionId);
    if (!state) {
      return reply.status(404).send({ error: 'Session 不存在' });
    }

    try {
      const screenshot = await browserService.screenshot(sessionId);
      const pageInfo = await browserService.getPageInfo(sessionId);
      return { screenshot, pageInfo };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /api/test-runner/:sessionId/detect-login — 偵測是否為登入頁面
  fastify.post<{
    Params: { sessionId: string };
  }>('/api/test-runner/:sessionId/detect-login', async (request, reply) => {
    const { sessionId } = request.params;
    const state = runnerStates.get(sessionId);
    if (!state) {
      return reply.status(404).send({ error: 'Session 不存在' });
    }

    try {
      const elements = await browserService.getInteractiveElements(sessionId);

      // 檢查是否有 password 欄位
      const hasPasswordField = elements.some(
        el => el.tag === 'input' && el.type === 'password'
      );

      // 檢查是否有登入相關按鈕/連結
      const loginKeywords = ['登入', '登录', 'login', 'signin', 'sign in', 'log in'];
      const hasLoginButton = elements.some(el => {
        const text = (el.text || '').toLowerCase();
        const name = (el.name || '').toLowerCase();
        const placeholder = (el.placeholder || '').toLowerCase();
        return loginKeywords.some(kw =>
          text.includes(kw) || name.includes(kw) || placeholder.includes(kw)
        );
      });

      // 檢查頁面元素是否較少（登入頁通常元素少）
      const fewElements = elements.length < 20;

      const isLoginPage = hasPasswordField && (hasLoginButton || fewElements);

      let reason = '';
      if (isLoginPage) {
        const reasons: string[] = [];
        if (hasPasswordField) reasons.push('偵測到密碼輸入欄位');
        if (hasLoginButton) reasons.push('偵測到登入按鈕');
        if (fewElements) reasons.push(`頁面元素較少（${elements.length} 個）`);
        reason = reasons.join('；');
      } else {
        reason = '未偵測到登入頁面特徵';
      }

      return { isLoginPage, reason };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /api/test-runner/:sessionId/explore — AI 探索頁面元素行為
  fastify.post<{
    Params: { sessionId: string };
  }>('/api/test-runner/:sessionId/explore', async (request, reply) => {
    const { sessionId } = request.params;
    const state = runnerStates.get(sessionId);
    if (!state) {
      return reply.status(404).send({ error: 'Session 不存在' });
    }

    try {
      const result = await explorerService.explorePage(sessionId, state.broadcast);
      // 儲存探索結果到 state，供 scan 使用
      state.behaviors = result.behaviors;
      return { behaviors: result.behaviors };
    } catch (err: any) {
      console.error(`[explore] 錯誤:`, err);
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /api/test-runner/:sessionId/deep-explore — 深度探索子頁面，建立整站地圖
  fastify.post<{
    Params: { sessionId: string };
  }>('/api/test-runner/:sessionId/deep-explore', async (request, reply) => {
    const { sessionId } = request.params;
    const state = runnerStates.get(sessionId);
    if (!state) return reply.status(404).send({ error: 'Session 不存在' });

    try {
      const siteMap = await explorerService.deepExplore(sessionId, state.url, state.broadcast);
      state.siteMap = siteMap;
      return { siteMap };
    } catch (err: any) {
      console.error(`[deep-explore] 錯誤:`, err);
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /api/test-runner/:sessionId/discuss — 多 AI 討論測試策略
  fastify.post<{
    Params: { sessionId: string };
  }>('/api/test-runner/:sessionId/discuss', async (request, reply) => {
    const { sessionId } = request.params;
    const state = runnerStates.get(sessionId);
    if (!state) return reply.status(404).send({ error: 'Session 不存在' });

    try {
      const screenshot = await browserService.screenshot(sessionId);
      const elements = await browserService.getInteractiveElements(sessionId);
      const pageInfo = await browserService.getPageInfo(sessionId);

      const discussion = await testOrchestrator.discuss(
        screenshot, elements, state.behaviors || [], pageInfo, state.broadcast, state.projectId
      );

      state.discussion = discussion;
      return { discussion };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /api/test-runner/:sessionId/review — 驗證結果 + 建議調整
  fastify.post<{
    Params: { sessionId: string };
  }>('/api/test-runner/:sessionId/review', async (request, reply) => {
    const { sessionId } = request.params;
    const state = runnerStates.get(sessionId);
    if (!state) return reply.status(404).send({ error: 'Session 不存在' });
    if (!state.testRunId) return reply.status(400).send({ error: '尚未執行測試' });

    try {
      const db = getDb();
      const results = db.prepare(
        'SELECT case_id as caseId, status, actual_result as actualResult, error FROM test_case_results WHERE test_run_id = ?'
      ).all(state.testRunId) as any[];

      const screenshot = await browserService.screenshot(sessionId);
      const review = await testOrchestrator.reviewResults(
        state.scanResult?.testPlan || [],
        results.map((r: any) => ({ caseId: r.caseId, passed: r.status === 'passed', actualResult: r.actualResult || '', error: r.error })),
        screenshot
      );

      return review;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /api/test-runner/:sessionId/scan — AI 掃描頁面
  fastify.post<{
    Params: { sessionId: string };
  }>('/api/test-runner/:sessionId/scan', async (request, reply) => {
    const { sessionId } = request.params;
    const state = runnerStates.get(sessionId);
    if (!state) {
      return reply.status(404).send({ error: 'Session 不存在' });
    }

    try {
      state.status = 'scanning';
      broadcastStatus(state);

      // 確保回到起始頁面（深度探索後可能在別的頁面）
      try {
        await browserService.navigateTo(sessionId, state.url);
        await new Promise(r => setTimeout(r, 1000));
      } catch { /* ignore */ }

      // 先滾動頁面觸發懶載入，再回到頂部截圖
      await browserService.scrollAndCollectElements(sessionId);
      const screenshot = await browserService.fullPageScreenshot(sessionId);
      const elements = await browserService.getInteractiveElements(sessionId);
      const pageInfo = await browserService.getPageInfo(sessionId);
      const domTree = await browserService.getDomTree(sessionId);

      // 如果有討論結果，加入 specContent
      let enrichedSpec = state.specContent || '';
      if (state.discussion && state.discussion.length > 0) {
        enrichedSpec += '\n\n' + testOrchestrator.formatDiscussionForPrompt(state.discussion);
      }

      // 優先用 project skill
      const projectSkills = state.projectId ? skillService.getProjectSkills(state.projectId) : [];
      if (projectSkills.length > 0) {
        console.log(`[scan] 使用 ${projectSkills.length} 個 project skill`);
        const skillsBlock = skillService.formatSkillsForPrompt(projectSkills, 4000);
        enrichedSpec += '\n\n' + skillsBlock;
      } else {
        // fallback 到 global skill 篩選
        try {
          const relevantSkills = await skillService.selectRelevant(pageInfo.url, pageInfo.title);
          if (relevantSkills.length > 0) {
            console.log(`[scan] 篩選出 ${relevantSkills.length} 個相關 skill: ${relevantSkills.map(s => s.name).join(', ')}`);
            const skillsBlock = skillService.formatSkillsForPrompt(relevantSkills, 4000);
            enrichedSpec += '\n\n' + skillsBlock;
          }
        } catch (err) {
          console.error('[scan] skill 篩選失敗:', err);
        }
      }

      // 如果有深度探索的頁面地圖，注入上下文
      if (state.siteMap && state.siteMap.length > 1) {
        const mapSummary = state.siteMap.map((p, i) =>
          `${i + 1}. [${p.pageType}] ${p.title} (${p.url})${p.fromLinkText ? ` ← 從「${p.fromLinkText}」進入` : ''}\n   元件: ${p.components.map(c => `<${c.tag}>${c.text}`).join(', ')}`
        ).join('\n');
        enrichedSpec += `\n\n## 整站頁面地圖（深度探索結果）
以下是 AI 自動探索發現的 ${state.siteMap.length} 個頁面，請根據頁面地圖產出**跨頁面的使用者旅程測試**：

${mapSummary}

**重要：測試案例應包含跨頁面的流程（如：從列表頁點擊物件→驗證詳情頁內容→返回列表），而非只測試起始頁。每個已發現的重要頁面至少要有一個測試案例涵蓋。**
`;
      }

      console.log(`[scan] enrichedSpec length: ${enrichedSpec.length}, specContent: ${(state.specContent || '').length}, has discussion: ${!!(state.discussion?.length)}, has siteMap: ${!!(state.siteMap?.length)}`);

      const scanResult = await pageScannerService.scanPage(
        screenshot,
        elements,
        pageInfo,
        enrichedSpec || undefined,
        state.behaviors,
        domTree
      );

      state.scanResult = scanResult;

      // 測試計畫版控：存版本記錄
      if (state.projectId) {
        try {
          const db = getDb();
          const maxVersion = (db.prepare(
            'SELECT MAX(version) as v FROM test_plan_versions WHERE project_id = ?'
          ).get(state.projectId) as any)?.v || 0;
          db.prepare(
            `INSERT INTO test_plan_versions (project_id, session_id, version, test_plan, components, url)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).run(
            state.projectId, sessionId, maxVersion + 1,
            JSON.stringify(scanResult.testPlan), JSON.stringify(scanResult.components), state.url
          );
          console.log(`[scan] 測試計畫版本 v${maxVersion + 1} 已儲存`);
        } catch (err) { console.error('[scan] 版控儲存失敗:', err); }
      }

      // 掃描完成時保存登入狀態（cookies + localStorage）
      try {
        state.savedSessionState = await browserService.saveSessionState(sessionId);
      } catch { /* ignore */ }

      state.status = 'ready';
      broadcastStatus(state);

      return { components: scanResult.components, testPlan: scanResult.testPlan };
    } catch (err: any) {
      console.error(`[scan] 錯誤:`, err);
      state.status = 'ready';
      broadcastStatus(state);
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /api/test-runner/:sessionId/execute — 執行測試計畫
  fastify.post<{
    Params: { sessionId: string };
    Body: { testCases?: string[] };
  }>('/api/test-runner/:sessionId/execute', async (request, reply) => {
    const { sessionId } = request.params;
    const { testCases: selectedIds } = request.body || {};
    const state = runnerStates.get(sessionId);
    if (!state) {
      return reply.status(404).send({ error: 'Session 不存在' });
    }
    if (!state.scanResult?.testPlan?.length) {
      return reply.status(400).send({ error: '請先執行頁面掃描' });
    }

    // 篩選要執行的案例
    let casesToRun = state.scanResult.testPlan;
    if (selectedIds && selectedIds.length > 0) {
      casesToRun = casesToRun.filter((tc: any) => selectedIds.includes(tc.id));
    }

    // 寫入 DB
    const db = getDb();
    const user = (request as any).user;
    const runResult = db.prepare(
      `INSERT INTO test_runs (project_id, url, status, total_cases, scan_result, created_by)
       VALUES (?, ?, 'running', ?, ?, ?)`
    ).run(
      state.projectId || null,
      state.url,
      casesToRun.length,
      JSON.stringify(state.scanResult),
      user?.id || null
    );
    const testRunId = Number(runResult.lastInsertRowid);
    state.testRunId = testRunId;

    // 自動回存 URL 到專案
    if (state.projectId && state.url) {
      try {
        db.prepare('UPDATE projects SET test_url = ?, updated_at = datetime(\'now\') WHERE id = ?')
          .run(state.url, state.projectId);
      } catch { /* ignore */ }
    }

    // 回傳後開始非同步執行
    reply.send({ testRunId, totalCases: casesToRun.length });

    // 非同步執行測試
    executeTests(state, casesToRun, testRunId).catch((err) => {
      console.error(`[testRunner] 執行測試失敗:`, err);
    });
  });

  // POST /api/test-runner/:sessionId/pause — 暫停測試
  fastify.post<{
    Params: { sessionId: string };
  }>('/api/test-runner/:sessionId/pause', async (request, reply) => {
    const { sessionId } = request.params;
    const state = runnerStates.get(sessionId);
    if (!state) return reply.status(404).send({ error: 'Session 不存在' });

    state.paused = true;
    state.status = 'paused';
    broadcastStatus(state);
    return { ok: true };
  });

  // POST /api/test-runner/:sessionId/resume — 繼續測試
  fastify.post<{
    Params: { sessionId: string };
  }>('/api/test-runner/:sessionId/resume', async (request, reply) => {
    const { sessionId } = request.params;
    const state = runnerStates.get(sessionId);
    if (!state) return reply.status(404).send({ error: 'Session 不存在' });

    state.paused = false;
    state.status = 'running';
    broadcastStatus(state);
    return { ok: true };
  });

  // POST /api/test-runner/:sessionId/skip — 跳過當前案例
  fastify.post<{
    Params: { sessionId: string };
  }>('/api/test-runner/:sessionId/skip', async (request, reply) => {
    const { sessionId } = request.params;
    const state = runnerStates.get(sessionId);
    if (!state) return reply.status(404).send({ error: 'Session 不存在' });

    state.skipped = true;
    return { ok: true };
  });

  // POST /api/test-runner/:sessionId/stop — 終止測試
  fastify.post<{
    Params: { sessionId: string };
  }>('/api/test-runner/:sessionId/stop', async (request, reply) => {
    const { sessionId } = request.params;
    const state = runnerStates.get(sessionId);
    if (!state) return reply.status(404).send({ error: 'Session 不存在' });

    state.stopped = true;
    state.paused = false; // 解除暫停以讓迴圈跳出
    state.status = 'done';
    broadcastStatus(state);
    return { ok: true };
  });

  // POST /api/test-runner/:sessionId/manual-start — 進入手動操作模式
  fastify.post<{
    Params: { sessionId: string };
  }>('/api/test-runner/:sessionId/manual-start', async (request, reply) => {
    const { sessionId } = request.params;
    const state = runnerStates.get(sessionId);
    if (!state) return reply.status(404).send({ error: 'Session 不存在' });

    state.paused = true;
    state.status = 'manual';
    broadcastStatus(state);

    // 切換到較慢的截圖串流（減少與使用者操作的競爭）
    browserService.stopScreenshotStream(sessionId);
    browserService.startScreenshotStream(sessionId, (base64) => {
      if (state.broadcast) {
        state.broadcast({ type: 'screenshot', data: base64 });
      }
    }, 1500);

    return { ok: true };
  });

  // POST /api/test-runner/:sessionId/manual-end — 結束手動操作，AI 繼續
  fastify.post<{
    Params: { sessionId: string };
  }>('/api/test-runner/:sessionId/manual-end', async (request, reply) => {
    const { sessionId } = request.params;
    const state = runnerStates.get(sessionId);
    if (!state) return reply.status(404).send({ error: 'Session 不存在' });

    // 保存登入後的 session state（cookies + localStorage）以便後續還原
    try {
      state.savedSessionState = await browserService.saveSessionState(sessionId);
    } catch { /* ignore */ }

    state.paused = false;
    state.status = 'running';
    broadcastStatus(state);

    // 恢復較快的截圖串流
    browserService.stopScreenshotStream(sessionId);
    browserService.startScreenshotStream(sessionId, (base64) => {
      if (state.broadcast) {
        state.broadcast({ type: 'screenshot', data: base64 });
      }
    }, 500);

    return { ok: true };
  });

  // PUT /api/test-runs/:id/project — 綁定測試記錄到專案
  fastify.put<{
    Params: { id: string };
    Body: { projectId: number };
  }>('/api/test-runs/:id/project', async (request, reply) => {
    const db = getDb();
    const { id } = request.params;
    const { projectId } = request.body as any;

    const run = db.prepare('SELECT id FROM test_runs WHERE id = ?').get(id);
    if (!run) return reply.status(404).send({ error: '測試記錄不存在' });

    db.prepare('UPDATE test_runs SET project_id = ? WHERE id = ?').run(projectId, id);
    return { ok: true };
  });

  // POST /api/test-runner/:sessionId/click — 使用者遠端點擊
  fastify.post<{
    Params: { sessionId: string };
    Body: { x: number; y: number };
  }>('/api/test-runner/:sessionId/click', async (request, reply) => {
    const { sessionId } = request.params;
    const state = runnerStates.get(sessionId);
    if (!state) return reply.status(404).send({ error: 'Session 不存在' });

    const { x, y } = request.body as any;
    try {
      const { page } = browserService.getSession(sessionId);

      // 點擊前先暫停截圖串流，避免與 page.screenshot() 競爭
      browserService.stopScreenshotStream(sessionId);

      await page.mouse.click(x, y);

      // 等待頁面穩定（導航、SPA 路由等）
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 300));

      // 操作後截圖含 pageInfo 並 WS 推送
      try {
        const screenshot = await browserService.screenshot(sessionId);
        const pageInfo = await browserService.getPageInfo(sessionId);
        if (state.broadcast) {
          state.broadcast({ type: 'screenshot', data: { screenshot, pageInfo } });
        }
      } catch {}

      // 恢復截圖串流
      browserService.startScreenshotStream(sessionId, (base64) => {
        if (state.broadcast) {
          state.broadcast({ type: 'screenshot', data: base64 });
        }
      }, state.status === 'manual' ? 1500 : 500);

      return { ok: true };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /api/test-runner/:sessionId/type — 使用者遠端輸入文字
  fastify.post<{
    Params: { sessionId: string };
    Body: { text: string };
  }>('/api/test-runner/:sessionId/type', async (request, reply) => {
    const { sessionId } = request.params;
    const state = runnerStates.get(sessionId);
    if (!state) return reply.status(404).send({ error: 'Session 不存在' });

    const { text } = request.body as any;
    try {
      const { page } = browserService.getSession(sessionId);
      await page.keyboard.type(text);

      // 操作後截圖含 pageInfo
      try {
        const screenshot = await browserService.screenshot(sessionId);
        const pageInfo = await browserService.getPageInfo(sessionId);
        if (state.broadcast) {
          state.broadcast({ type: 'screenshot', data: { screenshot, pageInfo } });
        }
      } catch {}

      return { ok: true };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /api/test-runner/:sessionId/key — 使用者遠端按鍵
  fastify.post<{
    Params: { sessionId: string };
    Body: { key: string };
  }>('/api/test-runner/:sessionId/key', async (request, reply) => {
    const { sessionId } = request.params;
    const state = runnerStates.get(sessionId);
    if (!state) return reply.status(404).send({ error: 'Session 不存在' });

    const { key } = request.body as any;
    try {
      const { page } = browserService.getSession(sessionId);
      await page.keyboard.press(key);

      // 操作後截圖含 pageInfo
      try {
        const screenshot = await browserService.screenshot(sessionId);
        const pageInfo = await browserService.getPageInfo(sessionId);
        if (state.broadcast) {
          state.broadcast({ type: 'screenshot', data: { screenshot, pageInfo } });
        }
      } catch {}

      return { ok: true };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // DELETE /api/test-runner/:sessionId — 關閉 session
  fastify.delete<{
    Params: { sessionId: string };
  }>('/api/test-runner/:sessionId', async (request, reply) => {
    const { sessionId } = request.params;
    const state = runnerStates.get(sessionId);
    if (!state) return reply.status(404).send({ error: 'Session 不存在' });

    state.stopped = true;
    state.paused = false;
    browserService.stopScreenshotStream(sessionId);
    await browserService.closeSession(sessionId);
    runnerStates.delete(sessionId);
    return { ok: true };
  });

  // ===== 測試報告 API =====

  // GET /api/test-runs — 列出所有測試記錄（支援 ?project_id 篩選）
  fastify.get<{
    Querystring: { project_id?: string };
  }>('/api/test-runs', async (request, reply) => {
    const db = getDb();
    const { project_id } = request.query;

    let sql = `SELECT id, project_id, url, status, total_cases, passed_cases, failed_cases, skipped_cases, created_at, completed_at FROM test_runs`;
    const params: unknown[] = [];

    if (project_id) {
      sql += ' WHERE project_id = ?';
      params.push(project_id);
    }

    sql += ' ORDER BY created_at DESC';

    const runs = db.prepare(sql).all(...params);
    return reply.send(runs);
  });

  // GET /api/test-runs/:id — 取得單個測試記錄（含 report MD）
  fastify.get<{
    Params: { id: string };
  }>('/api/test-runs/:id', async (request, reply) => {
    const db = getDb();
    const { id } = request.params;

    const run = db
      .prepare('SELECT * FROM test_runs WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;

    if (!run) {
      return reply.status(404).send({ error: '找不到測試記錄' });
    }

    return reply.send(run);
  });

  // GET /api/test-runs/:id/report — 下載報告 .md 檔案
  fastify.get<{
    Params: { id: string };
  }>('/api/test-runs/:id/report', async (request, reply) => {
    const db = getDb();
    const { id } = request.params;

    const run = db
      .prepare('SELECT id, report FROM test_runs WHERE id = ?')
      .get(id) as { id: number; report: string | null } | undefined;

    if (!run) {
      return reply.status(404).send({ error: '找不到測試記錄' });
    }

    // 如果報告尚未產出，即時產出
    let reportMd = run.report;
    if (!reportMd) {
      try {
        reportMd = reportService.generateReport(run.id);
        reportService.saveReport(run.id, reportMd);
      } catch (err: any) {
        return reply.status(500).send({ error: err.message });
      }
    }

    reply
      .header('Content-Type', 'text/markdown; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="test-report-${id}.md"`)
      .send(reportMd);
  });

  // GET /api/test-runs/:id/results — 取得所有測試案例結果
  fastify.get<{
    Params: { id: string };
  }>('/api/test-runs/:id/results', async (request, reply) => {
    const db = getDb();
    const { id } = request.params;

    const run = db
      .prepare('SELECT id FROM test_runs WHERE id = ?')
      .get(id) as { id: number } | undefined;

    if (!run) {
      return reply.status(404).send({ error: '找不到測試記錄' });
    }

    const results = db
      .prepare('SELECT * FROM test_case_results WHERE test_run_id = ? ORDER BY id ASC')
      .all(id);

    return reply.send(results);
  });

  // GET /api/projects/:projectId/test-runs/latest — 取得最近一次測試記錄（含結果）
  fastify.get<{
    Params: { projectId: string };
  }>('/api/projects/:projectId/test-runs/latest', async (request, reply) => {
    const db = getDb();
    const { projectId } = request.params;

    const run = db
      .prepare(
        `SELECT id, project_id, url, status, total_cases, passed_cases, failed_cases, skipped_cases, report, created_at, completed_at
         FROM test_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(projectId) as Record<string, unknown> | undefined;

    if (!run) {
      return reply.status(404).send({ error: '此專案尚無測試記錄' });
    }

    const results = db
      .prepare(
        'SELECT id, case_id, name, status, expected_result, actual_result, screenshot, error, started_at, completed_at FROM test_case_results WHERE test_run_id = ? ORDER BY id ASC'
      )
      .all(run.id) as any[];

    // 轉換為前端期望的格式
    return reply.send({
      id: String(run.id),
      projectId: run.project_id,
      url: run.url,
      createdAt: run.created_at,
      completedAt: run.completed_at,
      report: run.report,
      summary: {
        total: run.total_cases,
        passed: run.passed_cases,
        failed: run.failed_cases,
        skipped: run.skipped_cases,
      },
      results: results.map((r: any) => ({
        id: String(r.id),
        testCaseId: r.case_id,
        name: r.name,
        status: r.status,
        actualResult: r.actual_result,
        expectedResult: r.expected_result,
        screenshot: r.screenshot,
        error: r.error,
      })),
    });
  });

  // GET /api/projects/:projectId/test-plans — 測試計畫版本歷史
  fastify.get<{
    Params: { projectId: string };
  }>('/api/projects/:projectId/test-plans', async (request) => {
    const db = getDb();
    const versions = db.prepare(
      `SELECT id, version, url, created_at,
              json_array_length(test_plan) as case_count
       FROM test_plan_versions
       WHERE project_id = ?
       ORDER BY version DESC`
    ).all(Number(request.params.projectId));
    return versions;
  });

  // GET /api/projects/:projectId/test-plans/:version — 取得特定版本
  fastify.get<{
    Params: { projectId: string; version: string };
  }>('/api/projects/:projectId/test-plans/:version', async (request, reply) => {
    const db = getDb();
    const plan = db.prepare(
      'SELECT * FROM test_plan_versions WHERE project_id = ? AND version = ?'
    ).get(Number(request.params.projectId), Number(request.params.version));
    if (!plan) return reply.status(404).send({ error: '版本不存在' });
    return plan;
  });
}

/** 廣播狀態變更到 WebSocket */
function broadcastStatus(state: RunnerState): void {
  if (state.broadcast) {
    state.broadcast({ type: 'status', data: { state: state.status } });
  }
}

/** 非同步執行測試案例 */
async function executeTests(
  state: RunnerState,
  testCases: any[],
  testRunId: number
): Promise<void> {
  const db = getDb();
  state.status = 'running';
  state.stopped = false;
  state.paused = false;
  state.currentCaseIndex = 0;
  broadcastStatus(state);

  let passedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < testCases.length; i++) {
    state.currentCaseIndex = i;
    const tc = testCases[i];

    // 檢查是否已停止
    if (state.stopped) break;

    // 等待暫停解除
    while (state.paused && !state.stopped) {
      await new Promise((r) => setTimeout(r, 300));
    }
    if (state.stopped) break;

    // 檢查是否要跳過
    if (state.skipped) {
      state.skipped = false;
      skippedCount++;
      if (state.broadcast) {
        state.broadcast({
          type: 'result',
          data: { testCaseId: tc.id, passed: false, actualResult: '已跳過', skipped: true },
        });
      }
      db.prepare(
        `INSERT INTO test_case_results (test_run_id, case_id, name, status, steps, expected_result, actual_result, started_at, completed_at)
         VALUES (?, ?, ?, 'skipped', ?, ?, '已跳過', datetime('now'), datetime('now'))`
      ).run(testRunId, tc.id, tc.name, JSON.stringify(tc.steps), tc.expectedResult);
      continue;
    }

    // 記錄開始時間
    const caseStartTime = new Date().toISOString().replace('T', ' ').slice(0, 19);

    // 廣播步驟開始
    if (state.broadcast) {
      state.broadcast({
        type: 'step',
        data: { testCaseId: tc.id, stepIndex: 0, description: `開始執行: ${tc.name}`, status: 'running' },
      });
    }

    const stepErrors: string[] = [];
    const stepsSummary: Array<{ action: string; target?: string; description: string; success: boolean; error?: string }> = [];

    try {
      // 每個測試案例開始前，重整頁面確保乾淨狀態（清除殘留彈窗、modal 等）
      try {
        await browserService.navigateTo(state.sessionId, state.url);
        await new Promise((r) => setTimeout(r, 1000));
      } catch { /* ignore */ }

      // 確保在正確的頁面且已登入
      try {
        const currentInfo = await browserService.getPageInfo(state.sessionId);
        const currentOrigin = new URL(currentInfo.url).origin;
        const targetOrigin = new URL(state.url).origin;

        // 如果離開了目標網站，導航回去
        if (currentOrigin !== targetOrigin) {
          await browserService.navigateTo(state.sessionId, state.url);
          await new Promise((r) => setTimeout(r, 1000));
        }

        // 自主登入恢復：偵測是否在登入頁，自動嘗試重新登入
        const loginDetect = await browserService.detectLoginPage(state.sessionId);
        if (loginDetect.isLoginPage) {
          console.log(`[testRunner] TC-${tc.id}: 偵測到登入頁面，嘗試自動恢復登入...`);

          let loginRecovered = false;

          // 策略 1: 有保存的 session state → 還原 cookies/localStorage
          if (state.savedSessionState) {
            try {
              await browserService.restoreSessionState(state.sessionId, state.savedSessionState);
              await browserService.navigateTo(state.sessionId, state.url);
              await new Promise((r) => setTimeout(r, 1500));
              // 驗證是否還在登入頁
              const afterRestore = await browserService.detectLoginPage(state.sessionId);
              if (!afterRestore.isLoginPage) {
                loginRecovered = true;
                console.log(`[testRunner] 登入恢復成功（session state 還原）`);
              }
            } catch { /* ignore */ }
          }

          // 策略 2: 頁面有帳號選擇按鈕 → 自動點擊第一個帳號
          if (!loginRecovered && loginDetect.hasAccountSelector && loginDetect.clickableAccounts.length > 0) {
            try {
              const account = loginDetect.clickableAccounts[0];
              console.log(`[testRunner] 嘗試點擊帳號: ${account.text} (${account.selector})`);
              await browserService.click(state.sessionId, account.selector);
              await new Promise((r) => setTimeout(r, 2000));
              // 等待可能的頁面跳轉
              try { await browserService.getSession(state.sessionId).page.waitForLoadState('networkidle', { timeout: 5000 }); } catch { /* ignore */ }
              // 驗證是否離開登入頁
              const afterClick = await browserService.detectLoginPage(state.sessionId);
              if (!afterClick.isLoginPage) {
                loginRecovered = true;
                console.log(`[testRunner] 登入恢復成功（點擊帳號 ${account.text}）`);
                // 保存新的 session state
                try { state.savedSessionState = await browserService.saveSessionState(state.sessionId); } catch { /* ignore */ }
              }
            } catch (clickErr: any) {
              console.warn(`[testRunner] 點擊帳號失敗: ${clickErr.message}`);
            }
          }

          // 策略 3: 有密碼表單 + 有保存的 session → 嘗試導航到目標 URL（可能 cookie 還有效）
          if (!loginRecovered && loginDetect.hasPasswordForm) {
            try {
              await browserService.navigateTo(state.sessionId, state.url);
              await new Promise((r) => setTimeout(r, 1500));
              const afterNav = await browserService.detectLoginPage(state.sessionId);
              if (!afterNav.isLoginPage) {
                loginRecovered = true;
                console.log(`[testRunner] 登入恢復成功（直接導航）`);
              }
            } catch { /* ignore */ }
          }

          // 所有策略失敗 → 通知前端使用者手動登入
          if (!loginRecovered) {
            console.warn(`[testRunner] 自動登入恢復失敗，請求手動介入`);
            if (state.broadcast) {
              state.broadcast({
                type: 'need-manual-login',
                data: { message: '偵測到登入頁面，自動登入失敗，請手動登入後繼續', testCaseId: tc.id },
              });
            }
            // 進入手動模式，等待使用者登入
            state.status = 'manual';
            state.paused = true;
            broadcastStatus(state);
            // 等待使用者完成手動登入（manual-end API 會解除 paused）
            while (state.paused && !state.stopped) {
              await new Promise((r) => setTimeout(r, 500));
            }
            if (state.stopped) break;
          }
        }
      } catch { /* ignore */ }

      // 逐步執行
      for (let s = 0; s < (tc.steps || []).length; s++) {
        if (state.stopped) break;
        while (state.paused && !state.stopped) {
          await new Promise((r) => setTimeout(r, 300));
        }
        if (state.stopped) break;

        const step = tc.steps[s];

        // 保存步驟前截圖（供 AI 自問比較用），僅對會改變頁面的操作
        const needsSelfCheck = ['click', 'fill', 'select', 'hover', 'press', 'navigate'].includes(step.action);
        let beforeStepScreenshot: string | null = null;
        if (needsSelfCheck) {
          try { beforeStepScreenshot = await browserService.screenshot(state.sessionId); } catch { /* ignore */ }
        }

        if (state.broadcast) {
          state.broadcast({
            type: 'step',
            data: { testCaseId: tc.id, stepIndex: s, description: step.description, status: 'running' },
          });
        }

        const stepError = await executeStep(state.sessionId, step);
        if (stepError) {
          stepErrors.push(`步驟${s + 1}(${step.action} ${step.target || ''}): ${stepError}`);
        }

        // 收集步驟執行摘要（供評判使用）
        stepsSummary.push({
          action: step.action,
          target: step.target,
          description: step.description || `${step.action} ${step.target || ''}`,
          success: !stepError,
          error: stepError || undefined,
        });

        // AI 自問：這步操作的結果正常嗎？
        if (needsSelfCheck && beforeStepScreenshot) {
          try {
            const afterStepScreenshot = await browserService.screenshot(state.sessionId);
            const selfCheck = await selfQuestionService.analyzeStep(step, beforeStepScreenshot, afterStepScreenshot);
            if (selfCheck.needRevert) {
              try { await executeStep(state.sessionId, step); } catch { /* ignore revert error */ }
            }
            if (!selfCheck.passed && !selfCheck.expected) {
              stepErrors.push(`AI自問(${step.description}): ${selfCheck.change}`);
            }
          } catch { /* ignore self-check error */ }
        }

        // 每步完成後強制送截圖（讓使用者看到瀏覽器變化）
        try {
          const stepScreenshot = await browserService.screenshot(state.sessionId);
          if (state.broadcast) {
            state.broadcast({ type: 'screenshot', data: stepScreenshot });
          }
        } catch { /* ignore */ }

        if (state.broadcast) {
          state.broadcast({
            type: 'step',
            data: { testCaseId: tc.id, stepIndex: s, description: step.description, status: 'done' },
          });
        }
      }

      if (state.stopped) break;

      // 執行完所有步驟後，截圖並讓 AI 判斷結果
      const screenshot = await browserService.screenshot(state.sessionId);
      const pageInfo = await browserService.getPageInfo(state.sessionId);
      const result = await pageScannerService.executeTestCase(tc, screenshot, pageInfo, stepsSummary);
      result.screenshot = screenshot;

      // 如果有步驟錯誤，附加到 actualResult
      const errorSummary = stepErrors.length > 0 ? `\n\n執行錯誤：\n${stepErrors.join('\n')}` : '';
      const finalActualResult = (result.actualResult || '') + errorSummary;

      // 如果所有步驟都出錯，直接判定失敗
      const allStepsFailed = stepErrors.length === (tc.steps || []).length;
      const finalPassed = allStepsFailed ? false : result.passed;

      if (finalPassed) {
        passedCount++;
      } else {
        failedCount++;
      }

      // 寫入 DB（使用真實的開始/結束時間）
      const caseEndTime = new Date().toISOString().replace('T', ' ').slice(0, 19);
      db.prepare(
        `INSERT INTO test_case_results (test_run_id, case_id, name, status, steps, expected_result, actual_result, screenshot, error, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        testRunId,
        tc.id,
        tc.name,
        finalPassed ? 'passed' : 'failed',
        JSON.stringify(tc.steps),
        tc.expectedResult,
        finalActualResult,
        result.screenshot || null,
        stepErrors.length > 0 ? stepErrors.join('; ') : (result.error || null),
        caseStartTime,
        caseEndTime
      );

      // 廣播結果
      if (state.broadcast) {
        state.broadcast({
          type: 'result',
          data: {
            testCaseId: tc.id,
            passed: finalPassed,
            actualResult: finalActualResult,
            screenshot: result.screenshot,
          },
        });
      }
    } catch (err: any) {
      failedCount++;
      if (state.broadcast) {
        state.broadcast({
          type: 'result',
          data: { testCaseId: tc.id, passed: false, actualResult: `執行錯誤: ${err.message}` },
        });
      }
      const caseEndTime = new Date().toISOString().replace('T', ' ').slice(0, 19);
      db.prepare(
        `INSERT INTO test_case_results (test_run_id, case_id, name, status, steps, expected_result, error, started_at, completed_at)
         VALUES (?, ?, ?, 'failed', ?, ?, ?, ?, ?)`
      ).run(testRunId, tc.id, tc.name, JSON.stringify(tc.steps), tc.expectedResult, err.message, caseStartTime, caseEndTime);
    }
  }

  // 更新 test_run 結果
  db.prepare(
    `UPDATE test_runs SET status = 'completed', passed_cases = ?, failed_cases = ?, skipped_cases = ?, completed_at = datetime('now')
     WHERE id = ?`
  ).run(passedCount, failedCount, skippedCount, testRunId);

  // 產出並儲存 Markdown 測試報告
  try {
    const report = reportService.generateReport(testRunId);
    reportService.saveReport(testRunId, report);
  } catch (err) {
    console.error(`[testRunner] 產出報告失敗:`, err);
  }

  // autoDream: 測試完成後學習
  if (failedCount > 0 && state.projectId) {
    const allResults = db.prepare(
      'SELECT case_id as caseId, name, status, actual_result as actualResult, error FROM test_case_results WHERE test_run_id = ?'
    ).all(testRunId) as any[];
    skillService.dream(state.projectId, allResults.map((r: any) => ({
      caseId: r.caseId, name: r.name, passed: r.status === 'passed',
      actualResult: r.actualResult || '', error: r.error || undefined,
    }))).catch(err => console.error('[testRunner] dream 失敗:', err));
  }

  state.status = 'done';
  broadcastStatus(state);
}

/** 修正常見的 selector 錯誤 */
function fixSelector(selector: string): string {
  let s = selector.trim();

  // 修正 "button text=XXX" / "a text=XXX" → tag:has-text("XXX") 格式
  // AI 常把 tag 和 text selector 混在一起寫
  const tagTextMatch = s.match(/^(a|button|div|span|li|label|input|select)\s+text=["']?(.+?)["']?$/);
  if (tagTextMatch) {
    const [, tag, textVal] = tagTextMatch;
    s = `${tag}:has-text("${textVal}") >> visible=true`;
    return s;
  }

  // 修正 placeholder=XXX → [placeholder="XXX"]
  if (/^placeholder=/.test(s)) {
    const val = s.replace(/^placeholder=/, '');
    s = `[placeholder="${val}"]`;
  }

  // 修正 text=XXX（無引號）→ text="XXX"（精確匹配）
  if (/^text=[^"]/.test(s)) {
    const val = s.replace(/^text=/, '');
    s = `text="${val}"`;
  }

  // 對 text= selector 加上 visible 修飾，只匹配可見元素
  if (s.startsWith('text=') || s.startsWith('text="')) {
    s = s + ' >> visible=true';
  }

  return s;
}

/** 執行單一步驟（回傳錯誤訊息，null 表示成功） */
async function executeStep(sessionId: string, step: any): Promise<string | null> {
  // 自動修正 selector
  if (step.target) {
    step.target = fixSelector(step.target);
  }

  try {
  switch (step.action) {
    case 'click':
      if (step.target) {
        await browserService.click(sessionId, step.target);
      }
      break;
    case 'fill':
      if (step.target && step.value !== undefined) {
        await browserService.fill(sessionId, step.target, step.value);
        // 等待 debounce（搜尋框常有 300ms debounce）
        await new Promise(r => setTimeout(r, 500));
      }
      break;
    case 'select':
      if (step.target && step.value !== undefined) {
        await browserService.selectOption(sessionId, step.target, step.value);
      }
      break;
    case 'wait':
      if (step.target) {
        await browserService.waitForSelector(sessionId, step.target);
      } else {
        await new Promise((r) => setTimeout(r, 1000));
      }
      break;
    case 'assert': {
      // 跳過非 CSS selector 的 assert（如 document.url, url, title 等）
      const t = (step.target || '').trim();
      const isSpecial = ['document.url', 'document.title', 'url', 'title', 'body'].includes(t.toLowerCase());
      if (t && !isSpecial) {
        try {
          await browserService.waitForSelector(sessionId, t, 5000);
        } catch {
          // selector 找不到不視為致命錯誤，交給 AI 判斷
        }
      }
      // assert 的實際判斷由外層 AI executeTestCase 負責
      break;
    }
    case 'navigate':
      if (step.value || step.target) {
        await browserService.navigateTo(sessionId, step.value || step.target);
      }
      break;
    case 'hover':
      if (step.target) {
        await browserService.hover(sessionId, step.target);
      }
      break;
    case 'press':
      if (step.value) {
        await browserService.pressKey(sessionId, step.value);
      }
      break;
    default:
      // 未知操作，略過
      break;
  }
  } catch (err: any) {
    console.warn(`[executeStep] ${step.action} on "${step.target}" failed: ${err.message}`);
    // 每步驟後短暫等待
    await new Promise((r) => setTimeout(r, 300));
    return err.message || '未知錯誤';
  }

  // 每步驟後短暫等待，讓頁面穩定
  await new Promise((r) => setTimeout(r, 300));
  return null;
}
