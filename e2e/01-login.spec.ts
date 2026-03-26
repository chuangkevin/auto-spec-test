import { test, expect } from '@playwright/test';

test.describe('使用者選擇登入', () => {
  test('應顯示使用者選擇頁面', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=選擇你的身分')).toBeVisible();
    await expect(page.locator('text=Auto Spec Test')).toBeVisible();
    await expect(page.locator('button', { hasText: 'admin' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('點擊使用者後進入首頁', async ({ page }) => {
    await page.goto('/login');
    // 等待使用者列表載入
    const adminBtn = page.locator('button', { hasText: 'admin' });
    await expect(adminBtn).toBeVisible({ timeout: 10000 });
    await adminBtn.click();
    // 應跳轉到首頁並顯示歡迎訊息
    await expect(page).toHaveURL('/');
    await expect(page.locator('text=歡迎回來')).toBeVisible({ timeout: 10000 });
  });

  test('顯示新增使用者按鈕', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=新增使用者')).toBeVisible({
      timeout: 10000,
    });
  });
});
