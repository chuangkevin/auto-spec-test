import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('系統設定', () => {
  test('API Key 管理頁面', async ({ page }) => {
    await login(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // 確認頁面標題
    await expect(page.locator('h1', { hasText: '系統設定' })).toBeVisible();
    // 確認「匯入 API Key」區塊
    await expect(
      page.locator('h2', { hasText: '匯入 API Key' }),
    ).toBeVisible();
    // 確認「API Key 列表」區塊
    await expect(
      page.locator('h2', { hasText: 'API Key 列表' }),
    ).toBeVisible();
    // 確認「用量統計」區塊
    await expect(page.locator('h2', { hasText: '用量統計' })).toBeVisible();
    // 確認匯入 textarea 存在
    await expect(page.locator('textarea')).toBeVisible();
  });

  test('Gitea 設定區塊', async ({ page }) => {
    await login(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // 確認 Gitea 整合區塊存在
    await expect(page.locator('h2', { hasText: 'Gitea 整合' })).toBeVisible({
      timeout: 10000,
    });
  });
});
