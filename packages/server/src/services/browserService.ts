import { chromium, Browser, Page, BrowserContext } from 'playwright';

interface Session {
  context: BrowserContext;
  page: Page;
  streamInterval?: ReturnType<typeof setInterval>;
}

class BrowserService {
  private browser: Browser | null = null;
  private sessions = new Map<string, Session>();

  /** 啟動瀏覽器（lazy init） */
  async ensureBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }

  /** 建立新的測試 session */
  async createSession(sessionId: string): Promise<{ context: BrowserContext; page: Page }> {
    const browser = await this.ensureBrowser();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    this.sessions.set(sessionId, { context, page });
    return { context, page };
  }

  /** 取得 session（內部用） */
  private getSession(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} 不存在`);
    }
    return session;
  }

  /** 導航到 URL */
  async navigateTo(sessionId: string, url: string): Promise<void> {
    const { page } = this.getSession(sessionId);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  }

  /** 截圖（回傳 base64） */
  async screenshot(sessionId: string): Promise<string> {
    const { page } = this.getSession(sessionId);
    const buffer = await page.screenshot({ type: 'jpeg', quality: 60 });
    return buffer.toString('base64');
  }

  /** 開始連續截圖串流 */
  startScreenshotStream(
    sessionId: string,
    callback: (base64: string) => void,
    interval = 500
  ): void {
    const session = this.getSession(sessionId);
    // 先停止已存在的串流
    if (session.streamInterval) {
      clearInterval(session.streamInterval);
    }
    session.streamInterval = setInterval(async () => {
      try {
        const base64 = await this.screenshot(sessionId);
        callback(base64);
      } catch {
        // session 可能已關閉，靜默忽略
      }
    }, interval);
  }

  /** 停止截圖串流 */
  stopScreenshotStream(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session?.streamInterval) {
      clearInterval(session.streamInterval);
      session.streamInterval = undefined;
    }
  }

  /** 點擊元素 */
  async click(sessionId: string, selector: string): Promise<void> {
    const { page } = this.getSession(sessionId);
    await page.click(selector, { timeout: 10000 });
  }

  /** 填入文字 */
  async fill(sessionId: string, selector: string, value: string): Promise<void> {
    const { page } = this.getSession(sessionId);
    await page.fill(selector, value, { timeout: 10000 });
  }

  /** 等待選擇器出現 */
  async waitForSelector(sessionId: string, selector: string, timeout = 10000): Promise<void> {
    const { page } = this.getSession(sessionId);
    await page.waitForSelector(selector, { timeout });
  }

  /** 等待頁面導航完成 */
  async waitForNavigation(sessionId: string): Promise<void> {
    const { page } = this.getSession(sessionId);
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  }

  /** 取得頁面資訊 */
  async getPageInfo(sessionId: string): Promise<{ url: string; title: string }> {
    const { page } = this.getSession(sessionId);
    return {
      url: page.url(),
      title: await page.title(),
    };
  }

  /** 取得所有可互動元件 */
  async getInteractiveElements(sessionId: string): Promise<Array<{
    tag: string;
    type?: string;
    text?: string;
    placeholder?: string;
    selector: string;
    role?: string;
    name?: string;
  }>> {
    const { page } = this.getSession(sessionId);

    return await page.evaluate(() => {
      const interactiveSelectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [tabindex]';
      const elements = document.querySelectorAll(interactiveSelectors);
      const results: Array<{
        tag: string;
        type?: string;
        text?: string;
        placeholder?: string;
        selector: string;
        role?: string;
        name?: string;
      }> = [];

      /** 產出穩定的 CSS selector */
      function buildSelector(el: Element): string {
        // 優先用 id
        if (el.id) return `#${CSS.escape(el.id)}`;

        // 嘗試用 data-testid
        const testId = el.getAttribute('data-testid');
        if (testId) return `[data-testid="${CSS.escape(testId)}"]`;

        // 嘗試用 name
        const name = el.getAttribute('name');
        if (name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;

        // 嘗試用 aria-label
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) return `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(ariaLabel)}"]`;

        // 往上找路徑
        const parts: string[] = [];
        let current: Element | null = el;
        while (current && current !== document.body) {
          let tag = current.tagName.toLowerCase();
          if (current.id) {
            parts.unshift(`#${CSS.escape(current.id)}`);
            break;
          }
          const parent: Element | null = current.parentElement;
          if (parent) {
            const currentTag = current.tagName;
            const siblings = Array.from(parent.children).filter(
              (c: Element) => c.tagName === currentTag
            );
            if (siblings.length > 1) {
              const idx = siblings.indexOf(current) + 1;
              tag += `:nth-of-type(${idx})`;
            }
          }
          parts.unshift(tag);
          current = parent;
        }
        return parts.join(' > ');
      }

      elements.forEach((el) => {
        // 跳過隱藏元素
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return;

        const tag = el.tagName.toLowerCase();
        const text = (el.textContent || '').trim().slice(0, 100);
        const placeholder = el.getAttribute('placeholder') || undefined;
        const type = el.getAttribute('type') || undefined;
        const role = el.getAttribute('role') || undefined;
        const name = el.getAttribute('aria-label') || el.getAttribute('name') || undefined;

        results.push({
          tag,
          type,
          text: text || undefined,
          placeholder,
          selector: buildSelector(el),
          role,
          name,
        });
      });

      return results;
    });
  }

  /** 關閉 session */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.stopScreenshotStream(sessionId);
    try {
      await session.context.close();
    } catch {
      // 忽略已關閉的情況
    }
    this.sessions.delete(sessionId);
  }

  /** 關閉瀏覽器 */
  async shutdown(): Promise<void> {
    // 關閉所有 session
    for (const sessionId of this.sessions.keys()) {
      await this.closeSession(sessionId);
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const browserService = new BrowserService();
