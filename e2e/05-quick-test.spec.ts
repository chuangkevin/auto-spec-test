import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('快速測試', () => {
  test('快速測試頁面載入', async ({ page }) => {
    await login(page);
    await page.goto('/quick-test');
    await page.waitForLoadState('networkidle');

    // 確認標題
    await expect(page.locator('h1', { hasText: '快速測試' })).toBeVisible();
    // 確認 URL 輸入框存在
    await expect(page.locator('input[type="url"]')).toBeVisible();
    // 確認「開始」按鈕存在
    await expect(page.getByRole('button', { name: '開始' })).toBeVisible();
    // 確認說明文字
    await expect(
      page.locator(
        'text=貼上網址，AI 自動掃描頁面元件、規劃測試案例、逐條執行',
      ),
    ).toBeVisible();
  });

  test('輸入 URL 並掃描', async ({ page }) => {
    await login(page);
    await page.goto('/quick-test');
    await page.waitForLoadState('networkidle');

    // 輸入 URL
    const urlInput = page.locator('input[type="url"]');
    await urlInput.fill('https://example.com');
    // 點擊「開始」
    await page.getByRole('button', { name: '開始' }).click();

    // 進入測試執行面板後，應能看到「重新開始」按鈕
    await expect(page.locator('text=重新開始')).toBeVisible({
      timeout: 15000,
    });

    // 等待截圖出現（TestExecutionPanel 會顯示截圖）
    const screenshot = page.locator('img').first();
    await expect(screenshot).toBeVisible({ timeout: 30000 });
  });
});
