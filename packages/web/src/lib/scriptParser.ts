export interface TestCase {
  id: string;
  name: string;
  category: string;
  priority: string;
  precondition?: string;
  steps: string[];
  expectedResult: string;
  verificationPoints: string[];
}

export interface ParsedScript {
  title: string;
  info: Record<string, string>;
  globalPreconditions: string[];
  testCases: TestCase[];
}

/**
 * 解析測試腳本 Markdown 為結構化資料
 * 支援 spec 第 8 節定義的格式
 */
export function parseScriptMd(md: string): ParsedScript {
  const lines = md.split('\n');
  const result: ParsedScript = {
    title: '',
    info: {},
    globalPreconditions: [],
    testCases: [],
  };

  let i = 0;

  // 解析標題（# 開頭）
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.startsWith('# ')) {
      result.title = line.replace(/^#\s+/, '').trim();
      i++;
      break;
    }
    i++;
  }

  // 解析資訊區塊（**key**：value 或 **key**: value）
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.startsWith('### ') || line.startsWith('## ')) break;
    const infoMatch = line.match(/^\*\*(.+?)\*\*[：:]\s*(.+)$/);
    if (infoMatch) {
      result.info[infoMatch[1].trim()] = infoMatch[2].trim();
    }
    i++;
  }

  // 解析全域前置條件（## 前置條件 或 ## 全域前置條件）
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.startsWith('### ')) break;
    if (/^##\s+(全域)?前置條件/.test(line)) {
      i++;
      while (i < lines.length) {
        const condLine = lines[i].trim();
        if (condLine.startsWith('## ') || condLine.startsWith('### ')) break;
        const listMatch = condLine.match(/^[-*]\s+(.+)$/);
        if (listMatch) {
          result.globalPreconditions.push(listMatch[1].trim());
        }
        i++;
      }
      continue;
    }
    if (line.startsWith('## ')) {
      i++;
      continue;
    }
    i++;
  }

  // 解析測試案例（### TC-XXX: 名稱）
  while (i < lines.length) {
    const line = lines[i].trim();
    const tcMatch = line.match(/^###\s+(TC-\d+)[：:]\s*(.+)$/);
    if (tcMatch) {
      const tc: TestCase = {
        id: tcMatch[1],
        name: tcMatch[2].trim(),
        category: '',
        priority: '',
        precondition: undefined,
        steps: [],
        expectedResult: '',
        verificationPoints: [],
      };
      i++;

      // 解析此 TC 內的欄位
      while (i < lines.length) {
        const tcLine = lines[i].trim();
        // 遇到下一個 TC 或同級標題則停止
        if (/^###\s+TC-\d+/.test(tcLine)) break;
        if (/^##\s+/.test(tcLine)) break;

        // 分類
        const catMatch = tcLine.match(/^\*\*分類\*\*[：:]\s*(.+)$/);
        if (catMatch) {
          tc.category = catMatch[1].trim();
          i++;
          continue;
        }

        // 優先級
        const prioMatch = tcLine.match(/^\*\*優先級\*\*[：:]\s*(.+)$/);
        if (prioMatch) {
          tc.priority = prioMatch[1].trim();
          i++;
          continue;
        }

        // 前置條件
        const preMatch = tcLine.match(/^\*\*前置條件\*\*[：:]\s*(.+)$/);
        if (preMatch) {
          tc.precondition = preMatch[1].trim();
          i++;
          continue;
        }

        // 測試步驟
        if (/^\*\*測試步驟\*\*[：:]?/.test(tcLine)) {
          i++;
          while (i < lines.length) {
            const stepLine = lines[i].trim();
            if (stepLine.startsWith('**') || stepLine.startsWith('### ') || stepLine.startsWith('## ')) break;
            const stepMatch = stepLine.match(/^\d+[.、]\s*(.+)$/);
            if (stepMatch) {
              tc.steps.push(stepMatch[1].trim());
            }
            i++;
          }
          continue;
        }

        // 預期結果
        const erMatch = tcLine.match(/^\*\*預期結果\*\*[：:]\s*(.+)$/);
        if (erMatch) {
          tc.expectedResult = erMatch[1].trim();
          i++;
          continue;
        }

        // 驗證點
        if (/^\*\*驗證點\*\*[：:]?/.test(tcLine)) {
          i++;
          while (i < lines.length) {
            const vpLine = lines[i].trim();
            if (vpLine.startsWith('**') || vpLine.startsWith('### ') || vpLine.startsWith('## ')) break;
            const vpMatch = vpLine.match(/^[-*]\s+\[[ x]?\]\s*(.+)$/);
            if (vpMatch) {
              tc.verificationPoints.push(vpMatch[1].trim());
            }
            i++;
          }
          continue;
        }

        i++;
      }

      result.testCases.push(tc);
    } else {
      i++;
    }
  }

  return result;
}

/**
 * 將結構化測試腳本序列化為 Markdown
 */
export function serializeToMd(script: ParsedScript): string {
  const lines: string[] = [];

  // 標題
  lines.push(`# ${script.title}`);
  lines.push('');

  // 資訊區塊
  for (const [key, value] of Object.entries(script.info)) {
    lines.push(`**${key}**：${value}`);
  }
  if (Object.keys(script.info).length > 0) {
    lines.push('');
  }

  // 全域前置條件
  if (script.globalPreconditions.length > 0) {
    lines.push('## 前置條件');
    lines.push('');
    for (const cond of script.globalPreconditions) {
      lines.push(`- ${cond}`);
    }
    lines.push('');
  }

  // 測試案例
  for (const tc of script.testCases) {
    lines.push(`### ${tc.id}：${tc.name}`);
    lines.push('');
    lines.push(`**分類**：${tc.category}`);
    lines.push(`**優先級**：${tc.priority}`);
    if (tc.precondition) {
      lines.push(`**前置條件**：${tc.precondition}`);
    }
    lines.push('');

    lines.push('**測試步驟**：');
    tc.steps.forEach((step, idx) => {
      lines.push(`${idx + 1}. ${step}`);
    });
    lines.push('');

    lines.push(`**預期結果**：${tc.expectedResult}`);
    lines.push('');

    if (tc.verificationPoints.length > 0) {
      lines.push('**驗證點**：');
      for (const vp of tc.verificationPoints) {
        lines.push(`- [ ] ${vp}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
