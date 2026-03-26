import { type Page, expect } from '@playwright/test';

/**
 * 以 admin 身分登入（選擇使用者模式）
 */
export async function login(page: Page) {
  await page.goto('/login');
  // 等待使用者列表載入完成（不再顯示「載入中...」）
  await page.waitForSelector('text=選擇你的身分');
  // 點擊 admin 使用者
  const adminBtn = page.locator('button', { hasText: 'admin' });
  await expect(adminBtn).toBeVisible({ timeout: 10000 });
  await adminBtn.click();
  // 等待跳轉到首頁
  await page.waitForURL('/', { timeout: 10000 });
  await expect(page.locator('text=歡迎回來')).toBeVisible({ timeout: 10000 });
}

/**
 * 確保指定名稱的產品存在，若不存在則建立
 * 回傳產品名稱
 */
export async function ensureProduct(page: Page, name: string): Promise<string> {
  await page.goto('/products');
  await page.waitForLoadState('networkidle');

  // 檢查產品是否已存在
  const existing = page.locator('h3', { hasText: name });
  if (await existing.isVisible().catch(() => false)) {
    return name;
  }

  // 點擊「新增產品」
  await page.getByRole('button', { name: '新增產品' }).click();
  // 等待 modal 出現
  await expect(page.locator('h2', { hasText: '新增產品' })).toBeVisible();
  // 填入名稱
  await page.locator('input[placeholder="例如：電商平台"]').fill(name);
  // 點擊「建立」
  await page.getByRole('button', { name: '建立' }).click();
  // 等待 modal 關閉，產品出現在列表中
  await expect(page.locator('h3', { hasText: name })).toBeVisible({ timeout: 10000 });

  return name;
}

/**
 * 確保指定名稱的專案存在，若不存在則建立
 * 需先確保產品已存在
 * 回傳專案名稱
 */
export async function ensureProject(
  page: Page,
  name: string,
  productName: string,
): Promise<string> {
  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  // 檢查專案是否已存在
  const existing = page.locator('a', { hasText: name });
  if (await existing.isVisible().catch(() => false)) {
    return name;
  }

  // 點擊「新建專案」
  await page.getByRole('link', { name: '新建專案' }).click();
  await page.waitForURL('/projects/new');

  // 填入專案名稱
  await page.locator('input[placeholder="例如：電商平台登入模組測試"]').fill(name);
  // 選擇產品
  const productSelect = page.locator('#product-select');
  await productSelect.selectOption({ label: new RegExp(productName) });
  // 點擊「建立專案」
  await page.getByRole('button', { name: '建立專案' }).click();
  // 等待跳轉到專案詳情頁
  await page.waitForURL(/\/projects\/\d+/, { timeout: 10000 });

  return name;
}
