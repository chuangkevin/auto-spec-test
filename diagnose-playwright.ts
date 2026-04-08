
import { chromium } from 'playwright';

async function diagnose() {
  console.log('--- Playwright Diagnosis Start ---');
  let browser;
  try {
    console.log('Attempting to launch chromium...');
    browser = await chromium.launch({ headless: true });
    console.log('Chromium launched successfully.');

    const context = await browser.newContext();
    const page = await context.newPage();
    
    // 測試目標 URL (從專案截圖中推斷)
    const testUrl = 'http://localhost:3000'; 
    console.log(`Navigating to ${testUrl}...`);
    
    await page.goto(testUrl, { waitUntil: 'networkidle', timeout: 10000 });
    console.log(`Navigation to ${testUrl} successful!`);
    
    const title = await page.title();
    console.log(`Page title: ${title}`);

  } catch (err) {
    console.error('DIAGNOSIS ERROR:', err.message);
    if (err.message.includes('Executable not found')) {
      console.log('FIX SUGGESTION: Run "npx playwright install chromium"');
    }
  } finally {
    if (browser) await browser.close();
    console.log('--- Playwright Diagnosis End ---');
  }
}

diagnose();
