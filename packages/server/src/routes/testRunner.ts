import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/connection.js';
import { authHook } from '../middleware/auth.js';
import { browserService } from '../services/browserService.js';
import { pageScannerService } from '../services/pageScannerService.js';
import { reportService } from '../services/reportService.js';

/** 每個 session 的執行狀態 */
interface RunnerState {
  sessionId: string;
  url: string;
  projectId?: number;
  specContent?: string;
  status: 'scanning' | 'ready' | 'running' | 'paused' | 'manual' | 'done';
  scanResult?: any;
  testRunId?: number;
  currentCaseIndex: number;
  paused: boolean;
  skipped: boolean;
  stopped: boolean;
  /** WebSocket 訊息發送函式 */
  broadcast?: (msg: any) => void;
}

/** 全域 runner 狀態 */
export const runnerStates = new Map<string, RunnerState>();

export default async function testRunnerRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authHook);

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
      await browserService.createSession(sessionId);
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

      // 先滾動頁面觸發懶載入，再回到頂部截圖
      await browserService.scrollAndCollectElements(sessionId);
      const screenshot = await browserService.fullPageScreenshot(sessionId);
      const elements = await browserService.getInteractiveElements(sessionId);
      const pageInfo = await browserService.getPageInfo(sessionId);

      const scanResult = await pageScannerService.scanPage(
        screenshot,
        elements,
        pageInfo,
        state.specContent
      );

      state.scanResult = scanResult;
      state.status = 'ready';
      broadcastStatus(state);

      return { components: scanResult.components, testPlan: scanResult.testPlan };
    } catch (err: any) {
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
    return { ok: true };
  });

  // POST /api/test-runner/:sessionId/manual-end — 結束手動操作，AI 繼續
  fastify.post<{
    Params: { sessionId: string };
  }>('/api/test-runner/:sessionId/manual-end', async (request, reply) => {
    const { sessionId } = request.params;
    const state = runnerStates.get(sessionId);
    if (!state) return reply.status(404).send({ error: 'Session 不存在' });

    state.paused = false;
    state.status = 'running';
    broadcastStatus(state);
    return { ok: true };
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

    // 廣播步驟開始
    if (state.broadcast) {
      state.broadcast({
        type: 'step',
        data: { testCaseId: tc.id, stepIndex: 0, description: `開始執行: ${tc.name}`, status: 'running' },
      });
    }

    try {
      // 每個測試案例開始前，先導航回原始 URL（確保乾淨狀態）
      try {
        await browserService.navigateTo(state.sessionId, state.url);
        await new Promise((r) => setTimeout(r, 1000)); // 等待頁面載入
      } catch { /* ignore navigation error */ }

      // 逐步執行
      for (let s = 0; s < (tc.steps || []).length; s++) {
        if (state.stopped) break;
        while (state.paused && !state.stopped) {
          await new Promise((r) => setTimeout(r, 300));
        }
        if (state.stopped) break;

        const step = tc.steps[s];

        if (state.broadcast) {
          state.broadcast({
            type: 'step',
            data: { testCaseId: tc.id, stepIndex: s, description: step.description, status: 'running' },
          });
        }

        await executeStep(state.sessionId, step);

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
      const result = await pageScannerService.executeTestCase(tc, screenshot, pageInfo);
      result.screenshot = screenshot;

      if (result.passed) {
        passedCount++;
      } else {
        failedCount++;
      }

      // 寫入 DB
      db.prepare(
        `INSERT INTO test_case_results (test_run_id, case_id, name, status, steps, expected_result, actual_result, screenshot, error, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).run(
        testRunId,
        tc.id,
        tc.name,
        result.passed ? 'passed' : 'failed',
        JSON.stringify(tc.steps),
        tc.expectedResult,
        result.actualResult,
        result.screenshot || null,
        result.error || null
      );

      // 廣播結果
      if (state.broadcast) {
        state.broadcast({
          type: 'result',
          data: {
            testCaseId: tc.id,
            passed: result.passed,
            actualResult: result.actualResult,
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
      db.prepare(
        `INSERT INTO test_case_results (test_run_id, case_id, name, status, steps, expected_result, error, started_at, completed_at)
         VALUES (?, ?, ?, 'failed', ?, ?, ?, datetime('now'), datetime('now'))`
      ).run(testRunId, tc.id, tc.name, JSON.stringify(tc.steps), tc.expectedResult, err.message);
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

  state.status = 'done';
  broadcastStatus(state);
}

/** 執行單一步驟 */
async function executeStep(sessionId: string, step: any): Promise<void> {
  switch (step.action) {
    case 'click':
      if (step.target) {
        await browserService.click(sessionId, step.target);
      }
      break;
    case 'fill':
      if (step.target && step.value !== undefined) {
        await browserService.fill(sessionId, step.target, step.value);
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
    case 'assert':
      if (step.target) {
        await browserService.waitForSelector(sessionId, step.target, 5000);
      }
      break;
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

  // 每步驟後短暫等待，讓頁面穩定
  await new Promise((r) => setTimeout(r, 300));
}
