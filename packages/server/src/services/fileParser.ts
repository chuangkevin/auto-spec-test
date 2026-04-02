import { readFile } from 'fs/promises';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

/**
 * 根據檔案類型派發解析，回傳純文字內容。
 */
export async function parseFile(filePath: string, mimeType: string): Promise<string> {
  const ext = extractExtension(filePath);

  switch (ext) {
    case '.md':
    case '.txt':
    case '.json':
      return parseTextFile(filePath);
    case '.docx':
      return parseDocx(filePath);
    case '.xls':
    case '.xlsx':
      return parseSpreadsheet(filePath);
    case '.csv':
      return parseCsv(filePath);
    default:
      throw new Error(`不支援的檔案格式: ${ext}`);
  }
}

/**
 * 合併多個檔案的文字，每個檔案前加標題。
 */
export async function parseMultipleFiles(
  files: Array<{ path: string; name: string; type: string }>,
): Promise<string> {
  const sections: string[] = [];

  for (const file of files) {
    const header = `## 檔案：${file.name}\n\n`;
    try {
      const content = await parseFile(file.path, file.type);
      sections.push(header + content);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sections.push(header + `[解析失敗] ${message}`);
    }
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractExtension(filePath: string): string {
  const dotIndex = filePath.lastIndexOf('.');
  if (dotIndex === -1) return '';
  return filePath.slice(dotIndex).toLowerCase();
}

async function parseTextFile(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const text = buffer.toString('utf-8').trim();
  if (!text) return '[空檔案]';
  return text;
}

async function parseDocx(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  if (buffer.length === 0) return '[空檔案]';

  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.trim();
  if (!text) return '[空檔案]';
  return text;
}

async function parseSpreadsheet(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  if (buffer.length === 0) return '[空檔案]';

  const workbook = XLSX.read(buffer, { type: 'buffer' });

  if (workbook.SheetNames.length === 0) return '[空工作表]';

  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const text = XLSX.utils.sheet_to_txt(sheet).trim();
    if (workbook.SheetNames.length === 1) {
      parts.push(text || '[空工作表]');
    } else {
      parts.push(`### ${sheetName}\n\n${text || '[空工作表]'}`);
    }
  }

  return parts.join('\n\n');
}

async function parseCsv(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  if (buffer.length === 0) return '[空檔案]';

  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return '[空檔案]';

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return '[空檔案]';

  const text = XLSX.utils.sheet_to_txt(sheet).trim();
  if (!text) return '[空檔案]';
  return text;
}
