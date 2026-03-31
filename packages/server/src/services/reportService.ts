import { getDb } from '../db/connection.js';

interface TestRunRow {
  id: number;
  project_id: number | null;
  url: string;
  status: string;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  skipped_cases: number;
  scan_result: string | null;
  report: string | null;
  created_at: string;
  completed_at: string | null;
}

interface TestCaseResultRow {
  id: number;
  test_run_id: number;
  case_id: string;
  name: string;
  status: string;
  steps: string | null;
  expected_result: string | null;
  actual_result: string | null;
  screenshot: string | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface ProjectRow {
  id: number;
  name: string;
}

export class ReportService {
  /**
   * 根據 test_run 產出 Markdown 報告
   */
  generateReport(testRunId: number): string {
    const db = getDb();

    const testRun = db
      .prepare('SELECT * FROM test_runs WHERE id = ?')
      .get(testRunId) as TestRunRow | undefined;

    if (!testRun) {
      throw new Error(`找不到測試記錄 (id=${testRunId})`);
    }

    const results = db
      .prepare('SELECT * FROM test_case_results WHERE test_run_id = ? ORDER BY id ASC')
      .all(testRunId) as TestCaseResultRow[];

    // 取得專案名稱（若有）
    let projectName = '';
    if (testRun.project_id) {
      const project = db
        .prepare('SELECT name FROM projects WHERE id = ?')
        .get(testRun.project_id) as ProjectRow | undefined;
      if (project) {
        projectName = project.name;
      }
    }

    const passed = testRun.passed_cases;
    const failed = testRun.failed_cases;
    const skipped = testRun.skipped_cases;
    const total = testRun.total_cases;
    const denominator = total - skipped;
    const passRate = denominator > 0 ? Math.round((passed / denominator) * 100) : 0;

    // 計算測試耗時
    let duration = '';
    if (testRun.created_at && testRun.completed_at) {
      const start = new Date(testRun.created_at).getTime();
      const end = new Date(testRun.completed_at).getTime();
      const diffMs = end - start;
      if (diffMs > 0) {
        const seconds = Math.floor(diffMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainSeconds = seconds % 60;
        duration = minutes > 0 ? `${minutes} 分 ${remainSeconds} 秒` : `${seconds} 秒`;
      }
    }

    // 篩選失敗的案例作為 Bug 清單
    const failedResults = results.filter((r) => r.status === 'failed');

    const lines: string[] = [];

    // === 摘要 ===
    lines.push('# 測試報告');
    lines.push('');
    lines.push('## 摘要');
    if (projectName) {
      lines.push(`- 專案名稱：${projectName}`);
    }
    lines.push(`- 測試日期：${testRun.created_at}`);
    lines.push(`- 目標網址：${testRun.url}`);
    lines.push(`- 測試結果：通過 ${passed} / 失敗 ${failed} / 跳過 ${skipped}`);
    lines.push(`- 通過率：${passRate}%`);
    if (duration) {
      lines.push(`- 測試耗時：${duration}`);
    }
    lines.push('');

    // === Bug 清單 ===
    lines.push('## Bug 清單（待辦事項）');
    lines.push('');

    if (failedResults.length === 0) {
      lines.push('無失敗案例。');
      lines.push('');
    } else {
      failedResults.forEach((r, index) => {
        const bugId = `BUG-${String(index + 1).padStart(3, '0')}`;
        lines.push(`### [${bugId}] ${r.name}`);
        lines.push(`- **對應測試案例**：${r.case_id}`);

        // 重現步驟
        if (r.steps) {
          try {
            const steps = JSON.parse(r.steps) as { description?: string }[];
            if (steps.length > 0) {
              lines.push('- **重現步驟**：');
              steps.forEach((step, si) => {
                lines.push(`  ${si + 1}. ${step.description || '(無描述)'}`);
              });
            }
          } catch {
            // steps 解析失敗時略過
          }
        }

        if (r.expected_result) {
          lines.push(`- **預期結果**：${r.expected_result}`);
        }
        if (r.actual_result) {
          lines.push(`- **實際結果**：${r.actual_result}`);
        }
        if (r.error) {
          lines.push(`- **錯誤訊息**：${r.error}`);
        }
        lines.push('');
      });
    }

    // === 測試案例詳細結果 ===
    lines.push('## 測試案例詳細結果');
    lines.push('');

    // 建立 case_id 到 bug id 的對應
    const caseBugMap = new Map<string, string>();
    failedResults.forEach((r, index) => {
      caseBugMap.set(r.case_id, `BUG-${String(index + 1).padStart(3, '0')}`);
    });

    for (const r of results) {
      const statusIcon =
        r.status === 'passed' ? '✅' : r.status === 'failed' ? '❌' : '⏭';
      const statusLabel =
        r.status === 'passed' ? 'PASS' : r.status === 'failed' ? 'FAIL' : 'SKIP';

      const bugRef = caseBugMap.get(r.case_id);
      const bugSuffix = bugRef ? `（見 ${bugRef}）` : '';

      lines.push(`### ${r.case_id}: ${r.name} — ${statusIcon} ${statusLabel}${bugSuffix}`);

      // 執行時間
      if (r.started_at && r.completed_at) {
        const start = new Date(r.started_at).getTime();
        const end = new Date(r.completed_at).getTime();
        const diffSec = ((end - start) / 1000).toFixed(1);
        lines.push(`- 執行時間：${diffSec} 秒`);
        // 標記可疑的快速 PASS
        if (r.status === 'passed' && parseFloat(diffSec) < 2.0) {
          lines.push(`- ⚠️ **注意：執行時間過短，可能未充分驗證**`);
        }
      }

      if (r.status === 'failed') {
        if (r.actual_result) {
          lines.push(`- 實際結果：${r.actual_result}`);
        }
        if (r.error) {
          lines.push(`- 錯誤訊息：${r.error}`);
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 儲存報告到 DB
   */
  saveReport(testRunId: number, reportMd: string): void {
    const db = getDb();
    db.prepare('UPDATE test_runs SET report = ? WHERE id = ?').run(reportMd, testRunId);
  }
}

export const reportService = new ReportService();
