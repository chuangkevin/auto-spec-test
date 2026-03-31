import { chromium, Browser, Page, BrowserContext } from 'playwright';

const MAX_SESSIONS = Number(process.env.MAX_BROWSER_SESSIONS) || 3;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface Session {
  context: BrowserContext;
  page: Page;
  createdAt: number;
  streamInterval?: ReturnType<typeof setInterval>;
}

class BrowserService {
  private browser: Browser | null = null;
  private sessions = new Map<string, Session>();

  private cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > SESSION_TTL_MS) {
        this.closeSession(id);
      }
    }
  }, 5 * 60 * 1000); // 每 5 分鐘檢查一次

  /** 啟動瀏覽器（lazy init） */
  async ensureBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }

  /** 建立新的測試 session */
  async createSession(sessionId: string): Promise<{ context: BrowserContext; page: Page }> {
    // 如果已滿，關閉最舊的 session
    if (this.sessions.size >= MAX_SESSIONS) {
      let oldestId: string | null = null;
      let oldestTime = Infinity;
      for (const [id, session] of this.sessions) {
        if (session.createdAt < oldestTime) {
          oldestTime = session.createdAt;
          oldestId = id;
        }
      }
      if (oldestId) {
        await this.closeSession(oldestId);
      }
    }

    const browser = await this.ensureBrowser();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    this.sessions.set(sessionId, { context, page, createdAt: Date.now() });
    return { context, page };
  }

  /** 取得 session（內部用） */
  getSession(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} 不存在`);
    }
    return session;
  }

  /** 保存目前的 cookies + localStorage（登入後呼叫） */
  async saveSessionState(sessionId: string): Promise<{ cookies: any[]; localStorage: Record<string, string> }> {
    const { context, page } = this.getSession(sessionId);
    const cookies = await context.cookies();
    const localStorage = await page.evaluate(`(() => {
      var data = {};
      for (var i = 0; i < window.localStorage.length; i++) {
        var key = window.localStorage.key(i);
        data[key] = window.localStorage.getItem(key);
      }
      return data;
    })()`) as Record<string, string>;
    return { cookies, localStorage };
  }

  /** 還原 cookies + localStorage */
  async restoreSessionState(sessionId: string, state: { cookies: any[]; localStorage: Record<string, string> }): Promise<void> {
    const { context, page } = this.getSession(sessionId);
    if (state.cookies.length > 0) {
      await context.addCookies(state.cookies);
    }
    if (Object.keys(state.localStorage).length > 0) {
      const lsJson = JSON.stringify(state.localStorage);
      await page.evaluate(`((data) => {
        for (var k in data) {
          window.localStorage.setItem(k, data[k]);
        }
      })(${lsJson})`);
    }
  }

  /** 檢查是否在登入頁面（有 password input 或 URL 含 login） */
  async isLoginPage(sessionId: string): Promise<boolean> {
    const { page } = this.getSession(sessionId);
    const url = page.url().toLowerCase();
    if (url.includes('login') || url.includes('signin') || url.includes('auth')) return true;
    const hasPassword = await page.evaluate(`(() => {
      return document.querySelectorAll('input[type="password"]').length > 0;
    })()`) as boolean;
    return hasPassword;
  }

  /** 偵測登入頁面並回傳可點擊的帳號/身份元素 */
  async detectLoginPage(sessionId: string): Promise<{
    isLoginPage: boolean;
    hasPasswordForm: boolean;
    hasAccountSelector: boolean;
    clickableAccounts: Array<{ text: string; selector: string }>;
  }> {
    const { page } = this.getSession(sessionId);
    const url = page.url().toLowerCase();
    const urlHasLogin = url.includes('login') || url.includes('signin') || url.includes('auth');

    const domInfo = await page.evaluate(`(() => {
      const hasPassword = document.querySelectorAll('input[type="password"]').length > 0;

      // 尋找可能是帳號選擇的按鈕（文字含使用者名稱、角色名稱等）
      const clickableAccounts = [];
      const buttons = document.querySelectorAll('button, [role="button"], a');
      for (const btn of buttons) {
        const text = (btn.textContent || '').trim();
        // 跳過空白、太長（不太可能是帳號按鈕）、或功能性按鈕
        if (!text || text.length > 30 || text.length < 1) continue;
        const lower = text.toLowerCase();
        // 排除常見的非帳號按鈕
        if (['登入', '登录', 'login', 'sign in', 'submit', '送出', '新增', '註冊', 'register', 'sign up'].includes(lower)) continue;

        // 有 data-testid、id、或明確的 role 的按鈕更可能是帳號選擇
        const el = btn;
        let selector = '';
        if (el.id) {
          selector = '#' + el.id;
        } else if (el.getAttribute('data-testid')) {
          selector = '[data-testid="' + el.getAttribute('data-testid') + '"]';
        } else {
          // 用 text content 作為 selector
          selector = 'text=' + text;
        }

        clickableAccounts.push({ text, selector });
      }

      return {
        hasPassword,
        clickableAccountsCount: clickableAccounts.length,
        clickableAccounts: clickableAccounts.slice(0, 10),
      };
    })()`) as any;

    const isLogin = urlHasLogin || domInfo.hasPassword;
    const hasAccountSelector = !domInfo.hasPassword && domInfo.clickableAccountsCount > 0 && domInfo.clickableAccountsCount <= 10;

    return {
      isLoginPage: isLogin || hasAccountSelector,
      hasPasswordForm: domInfo.hasPassword,
      hasAccountSelector,
      clickableAccounts: domInfo.clickableAccounts || [],
    };
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

  /** 全頁截圖（擷取完整頁面，品質較高） */
  async fullPageScreenshot(sessionId: string): Promise<string> {
    const { page } = this.getSession(sessionId);
    const buffer = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: true });
    return buffer.toString('base64');
  }

  /** 滾動頁面並收集所有可互動元素（解決懶載入問題） */
  async scrollAndCollectElements(sessionId: string): Promise<void> {
    const { page } = this.getSession(sessionId);
    await page.evaluate(`(async () => {
      var totalHeight = document.body.scrollHeight;
      var viewHeight = window.innerHeight;
      for (var i = 0; i < totalHeight; i += viewHeight) {
        window.scrollTo(0, i);
        await new Promise(r => setTimeout(r, 300));
      }
      window.scrollTo(0, 0);
    })()`);
    // 等待回到頂部後的渲染
    await new Promise(r => setTimeout(r, 500));
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

    // Use string evaluation to avoid esbuild __name injection in page context
    return await page.evaluate(`(() => {
      var selectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="combobox"], [role="listbox"], [role="switch"], [tabindex], [onclick], label[for], .dropdown, .select, [class*="dropdown"], [class*="select"], [class*="checkbox"], [class*="filter"]';
      var elements = document.querySelectorAll(selectors);
      var results = [];
      var buildSelector = function(el) {
        if (el.id) return '#' + CSS.escape(el.id);
        var testId = el.getAttribute('data-testid');
        if (testId) return '[data-testid="' + CSS.escape(testId) + '"]';
        var nm = el.getAttribute('name');
        if (nm) return el.tagName.toLowerCase() + '[name="' + CSS.escape(nm) + '"]';
        var aria = el.getAttribute('aria-label');
        if (aria) return el.tagName.toLowerCase() + '[aria-label="' + CSS.escape(aria) + '"]';
        var parts = [];
        var cur = el;
        while (cur && cur !== document.body) {
          var tag = cur.tagName.toLowerCase();
          if (cur.id) { parts.unshift('#' + CSS.escape(cur.id)); break; }
          var parent = cur.parentElement;
          if (parent) {
            var curTag = cur.tagName;
            var siblings = Array.from(parent.children).filter(function(c) { return c.tagName === curTag; });
            if (siblings.length > 1) { tag += ':nth-of-type(' + (siblings.indexOf(cur) + 1) + ')'; }
          }
          parts.unshift(tag);
          cur = parent;
        }
        return parts.join(' > ');
      };
      elements.forEach(function(el) {
        var rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        var style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return;
        var tag = el.tagName.toLowerCase();
        var text = (el.textContent || '').trim().slice(0, 100);
        results.push({
          tag: tag,
          type: el.getAttribute('type') || undefined,
          text: text || undefined,
          placeholder: el.getAttribute('placeholder') || undefined,
          selector: buildSelector(el),
          role: el.getAttribute('role') || undefined,
          name: el.getAttribute('aria-label') || el.getAttribute('name') || undefined,
          href: (tag === 'a' && el.href) ? el.href : undefined
        });
      });
      return results;
    })()`) as any;
  }

  /** 取得頁面 DOM 樹（精簡結構） */
  async getDomTree(sessionId: string): Promise<any> {
    const { page } = this.getSession(sessionId);

    // 用 string evaluate 避免 esbuild __name 問題
    return await page.evaluate(`(() => {
      var SKIP_TAGS = ['SCRIPT','STYLE','SVG','NOSCRIPT','LINK','META','BR','HR'];
      var MAX_CHILDREN = 20;
      var MAX_DEPTH = 3;

      function buildNode(el, depth) {
        if (!el || !el.tagName) return null;
        if (SKIP_TAGS.includes(el.tagName)) return null;
        if (depth > MAX_DEPTH) return null;

        var rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return null;

        var node = {
          tag: el.tagName.toLowerCase(),
          id: el.id || undefined,
          class: el.className && typeof el.className === 'string' ? el.className.split(' ').filter(Boolean).slice(0,5).join(' ') : undefined,
          text: (el.textContent || '').trim().slice(0, 50) || undefined,
          attrs: {}
        };

        // 收集重要屬性
        ['data-testid','aria-label','name','type','href','placeholder','role','value','for'].forEach(function(attr) {
          var val = el.getAttribute(attr);
          if (val) node.attrs[attr] = val.slice(0, 100);
        });
        if (Object.keys(node.attrs).length === 0) delete node.attrs;

        // 產出穩定 selector
        if (el.id) {
          node.selector = '#' + CSS.escape(el.id);
        } else if (el.getAttribute('data-testid')) {
          node.selector = '[data-testid="' + el.getAttribute('data-testid') + '"]';
        } else if (el.getAttribute('name')) {
          node.selector = el.tagName.toLowerCase() + '[name="' + el.getAttribute('name') + '"]';
        } else if (el.getAttribute('aria-label')) {
          node.selector = '[aria-label="' + el.getAttribute('aria-label') + '"]';
        }

        // 子節點
        if (depth < MAX_DEPTH && el.children.length > 0) {
          var kids = [];
          for (var i = 0; i < Math.min(el.children.length, MAX_CHILDREN); i++) {
            var child = buildNode(el.children[i], depth + 1);
            if (child) kids.push(child);
          }
          if (kids.length > 0) node.children = kids;
        }

        return node;
      }

      return buildNode(document.body, 0);
    })()`) as any;
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

  /** 選擇下拉選項 */
  async selectOption(sessionId: string, selector: string, value: string): Promise<void> {
    const { page } = this.getSession(sessionId);
    await page.selectOption(selector, value, { timeout: 10000 });
  }

  /** 滑鼠 hover */
  async hover(sessionId: string, selector: string): Promise<void> {
    const { page } = this.getSession(sessionId);
    await page.hover(selector, { timeout: 10000 });
  }

  /** 按鍵 */
  async pressKey(sessionId: string, key: string): Promise<void> {
    const { page } = this.getSession(sessionId);
    await page.keyboard.press(key);
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
