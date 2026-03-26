import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('產品管理', () => {
  test('建立產品', async ({ page }) => {
    await login(page);
    const testProductName = `E2E測試產品_${Date.now()}`;

    // 導航到產品管理
    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    // 點擊「新增產品」
    await page.getByRole('button', { name: '新增產品' }).click();
    // Modal 應出現
    await expect(page.locator('h2', { hasText: '新增產品' })).toBeVisible();

    // 填入名稱
    await page.locator('input[placeholder="例如：電商平台"]').fill(testProductName);
    // 點擊建立
    await page.getByRole('button', { name: '建立' }).click();

    // 等待 modal 消失，產品出現在列表
    await expect(
      page.locator('h3', { hasText: testProductName }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('刪除產品', async ({ page }) => {
    await login(page);
    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    // 先建立一個待刪除的產品
    const deleteName = `E2E待刪除_${Date.now()}`;
    await page.getByRole('button', { name: '新增產品' }).click();
    await expect(page.locator('h2', { hasText: '新增產品' })).toBeVisible();
    await page.locator('input[placeholder="例如：電商平台"]').fill(deleteName);
    await page.getByRole('button', { name: '建立' }).click();
    await expect(page.locator('h3', { hasText: deleteName })).toBeVisible({
      timeout: 10000,
    });

    // 找到該產品卡片上的刪除按鈕
    const card = page
      .locator('div', { hasText: deleteName })
      .filter({ has: page.locator('h3') });
    // 攔截 confirm dialog
    page.on('dialog', (dialog) => dialog.accept());
    await card.locator('button[title="刪除產品"]').click();

    // 確認產品已從列表消失
    await expect(
      page.locator('h3', { hasText: deleteName }),
    ).not.toBeVisible({ timeout: 10000 });
  });
});
