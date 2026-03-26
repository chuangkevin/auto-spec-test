import { test, expect } from '@playwright/test';
import { login, ensureProduct, ensureProject } from './helpers';
import path from 'path';
import fs from 'fs';

test.describe('規格書上傳', () => {
  test('上傳 markdown 規格書', async ({ page }) => {
    const productName = `E2E產品_上傳_${Date.now()}`;
    const projectName = `E2E專案_上傳_${Date.now()}`;

    await login(page);
    await ensureProduct(page, productName);
    await ensureProject(page, projectName, productName);

    // 進入專案詳情頁（已在 ensureProject 跳轉）
    await page.waitForLoadState('networkidle');

    // 確認有上傳規格書的區域 — SpecUploader 使用 input[type=file]
    const fileInput = page.locator('input[type="file"]');

    // 建立臨時 .md 測試檔案
    const tmpDir = path.join(process.cwd(), 'e2e', '.tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const mdPath = path.join(tmpDir, 'test-spec.md');
    fs.writeFileSync(
      mdPath,
      '# 測試規格書\n\n## 登入功能\n\n- 使用者可以輸入帳號密碼登入\n- 登入失敗顯示錯誤訊息\n',
    );

    // 上傳檔案
    await fileInput.setInputFiles(mdPath);

    // 確認檔案已被選取（應顯示在待上傳列表中）
    await expect(page.locator('text=test-spec.md')).toBeVisible({
      timeout: 5000,
    });

    // 清理臨時檔案
    fs.unlinkSync(mdPath);
    if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
  });
});
