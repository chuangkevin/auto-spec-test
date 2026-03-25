import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { parseFile, parseMultipleFiles } from '../fileParser.js';

describe('fileParser', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = resolve(tmpdir(), `fileparser-test-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('parseFile', () => {
    it('reads a .md file and returns its content', async () => {
      const filePath = resolve(tempDir, 'sample.md');
      await writeFile(filePath, '# Hello\n\nWorld');

      const result = await parseFile(filePath, 'text/markdown');
      expect(result).toBe('# Hello\n\nWorld');
    });

    it('reads a .txt file and returns its content', async () => {
      const filePath = resolve(tempDir, 'note.txt');
      await writeFile(filePath, 'plain text content');

      const result = await parseFile(filePath, 'text/plain');
      expect(result).toBe('plain text content');
    });

    it('throws for unsupported file extensions', async () => {
      const filePath = resolve(tempDir, 'image.png');
      await writeFile(filePath, 'not-a-real-image');

      await expect(parseFile(filePath, 'image/png')).rejects.toThrow(
        '不支援的檔案格式',
      );
    });
  });

  describe('parseMultipleFiles', () => {
    it('merges multiple files with headers', async () => {
      const mdPath = resolve(tempDir, 'a.md');
      const txtPath = resolve(tempDir, 'b.txt');
      await writeFile(mdPath, 'content-a');
      await writeFile(txtPath, 'content-b');

      const result = await parseMultipleFiles([
        { path: mdPath, name: 'a.md', type: 'text/markdown' },
        { path: txtPath, name: 'b.txt', type: 'text/plain' },
      ]);

      expect(result).toContain('## 檔案：a.md');
      expect(result).toContain('content-a');
      expect(result).toContain('## 檔案：b.txt');
      expect(result).toContain('content-b');
    });

    it('includes error message when a file fails to parse', async () => {
      const badPath = resolve(tempDir, 'bad.png');
      await writeFile(badPath, 'data');

      const result = await parseMultipleFiles([
        { path: badPath, name: 'bad.png', type: 'image/png' },
      ]);

      expect(result).toContain('## 檔案：bad.png');
      expect(result).toContain('[解析失敗]');
    });
  });
});
