import { test, expect } from '@playwright/test';
import { login, ensureProduct } from './helpers';

test.describe('專案管理', () => {
  test('建立專案', async ({ page }) => {
    await login(page);
    const productName = `E2E產品_專案_${Date.now()}`;
    const projectName = `E2E測試專案_${Date.now()}`;

    // 確保有產品
    await ensureProduct(page, productName);

    // 導航到新建專案頁
    await page.goto('/projects/new');
    await page.waitForLoadState('networkidle');

    // 填入專案名稱
    await page
      .locator('input[placeholder="例如：電商平台登入模組測試"]')
      .fill(projectName);
    // 選擇產品
    const productSelect = page.locator('#product-select');
    await productSelect.selectOption({ label: new RegExp(productName) });
    // 點擊建立專案
    await page.getByRole('button', { name: '建立專案' }).click();

    // 應跳轉到專案詳情頁
    await page.waitForURL(/\/projects\/\d+/, { timeout: 10000 });
  });

  test('專案列表篩選', async ({ page }) => {
    await login(page);

    // 導航到專案列表
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // 確認篩選元素存在
    const productFilter = page.locator('select').first();
    await expect(productFilter).toBeVisible();
    // 確認狀態篩選存在
    const statusFilter = page.locator('select').nth(1);
    await expect(statusFilter).toBeVisible();
    // 確認搜尋框存在
    await expect(
      page.locator('input[placeholder="搜尋專案名稱..."]'),
    ).toBeVisible();

    // 選擇狀態篩選 → 草稿
    await statusFilter.selectOption('draft');
    // 等待網路請求完成
    await page.waitForLoadState('networkidle');
  });
});
