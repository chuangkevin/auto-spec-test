import { browserService } from './browserService.js';
import { generateRuntimeText } from './aiRuntimeService.js';
// skillService not needed in explorer — analyzeChange only classifies toggle/modal/nav

interface BehaviorResult {
  selector: string;
  type: 'toggle' | 'navigation' | 'modal' | 'dropdown' | 'form_submit' | 'no_effect';
  description: string;
}

/** 頁面地圖中的單一頁面 */
export interface SiteMapPage {
  url: string;
  title: string;
  /** 頁面類型 */
  pageType: 'list' | 'detail' | 'form' | 'login' | 'settings' | 'dashboard' | 'other';
  /** 從哪個頁面的哪個連結來的 */
  fromUrl?: string;
  fromLinkText?: string;
  /** 該頁面的核心元件摘要 */
  components: Array<{ tag: string; text: string; type?: string }>;
  /** 探索深度 */
  depth: number;
}

export class ExplorerService {
  /** 探索頁面中各元素的行為 */
  async explorePage(sessionId: string, broadcast?: (msg: any) => void): Promise<{
    behaviors: BehaviorResult[];
  }> {
    const elements = await browserService.getInteractiveElements(sessionId);
    const behaviors: BehaviorResult[] = [];

    // 只探索前 15 個重要元素（避免太久）
    const toExplore = elements
      .filter(el => ['button', 'a', 'select'].includes(el.tag) || el.role === 'button')
      .slice(0, 15);

    // 廣播探索開始
    if (broadcast) {
      broadcast({ type: 'explore-start', data: { total: toExplore.length } });
    }

    for (let idx = 0; idx < toExplore.length; idx++) {
      const el = toExplore[idx];
      const elText = String(el.text || '').slice(0, 30);

      // 廣播正在探索哪個元素
      try {
        if (broadcast) {
          broadcast({
            type: 'explore-step',
            data: {
              index: idx,
              total: toExplore.length,
              element: { tag: el.tag, text: elText, selector: el.selector },
              status: 'exploring',
            },
          });
        }
      } catch { /* WS 可能已斷 */ }

      try {
        const beforeScreenshot = await browserService.screenshot(sessionId);
        const beforeUrl = (await browserService.getPageInfo(sessionId)).url;

        try {
          await browserService.click(sessionId, el.selector);
          await new Promise(r => setTimeout(r, 800));
        } catch {
          behaviors.push({ selector: el.selector, type: 'no_effect', description: '點擊無反應' });
          continue;
        }

        const afterScreenshot = await browserService.screenshot(sessionId);
        const afterUrl = (await browserService.getPageInfo(sessionId)).url;

        // 用 AI 比較前後差異
        const analysis = await this.analyzeChange(beforeScreenshot, afterScreenshot, beforeUrl, afterUrl, el);
        const behavior = { selector: el.selector, ...analysis } as BehaviorResult;
        behaviors.push(behavior);

        // 廣播單個元素的探索結果
        try {
          if (broadcast) {
            broadcast({
              type: 'explore-step',
              data: {
                index: idx,
                total: toExplore.length,
                element: { tag: el.tag, text: elText, selector: el.selector },
                status: 'done',
                behavior,
              },
            });
          }
        } catch { /* WS 可能已斷 */ }

        // 如果是 navigation，回到原始頁面
        if (afterUrl !== beforeUrl) {
          try {
            await browserService.navigateTo(sessionId, beforeUrl);
            await new Promise(r => setTimeout(r, 500));
          } catch { /* ignore */ }
        }
        // 如果是 toggle/modal，嘗試恢復
        if (analysis.type === 'toggle' || analysis.type === 'modal') {
          try {
            await browserService.click(sessionId, el.selector);
            await new Promise(r => setTimeout(r, 300));
          } catch { /* ignore */ }
        }
      } catch (err) {
        console.warn(`[explorer] 探索元素 ${idx}/${toExplore.length} 失敗:`, err);
        behaviors.push({ selector: el.selector, type: 'no_effect', description: '探索失敗' });
      }
    }

    // 探索完成後重整頁面，清除所有殘留的彈窗、modal、dropdown 等
    try {
      const pageInfo = await browserService.getPageInfo(sessionId);
      await browserService.navigateTo(sessionId, pageInfo.url);
      await new Promise(r => setTimeout(r, 1000));
    } catch { /* ignore */ }

    return { behaviors };
  }

  /**
   * 深度探索：跟隨導航連結，探索子頁面，建立整站頁面地圖
   * - 最大深度 3 層
   * - 最多 10 個頁面
   * - 同 origin 才跟隨
   */
  async deepExplore(
    sessionId: string,
    startUrl: string,
    broadcast?: (msg: any) => void
  ): Promise<SiteMapPage[]> {
    const siteMap: SiteMapPage[] = [];
    const visitedUrls = new Set<string>();
    const MAX_PAGES = 10;
    const MAX_DEPTH = 3;

    // 標準化 URL（去掉 hash、trailing slash）
    const normalizeUrl = (u: string) => {
      try {
        const parsed = new URL(u);
        parsed.hash = '';
        return parsed.href.replace(/\/$/, '');
      } catch { return u; }
    };

    const startOrigin = new URL(startUrl).origin;

    // BFS 佇列
    const queue: Array<{ url: string; depth: number; fromUrl?: string; fromLinkText?: string }> = [
      { url: startUrl, depth: 0 },
    ];

    try {
      if (broadcast) {
        broadcast({ type: 'deep-explore-start', data: { maxPages: MAX_PAGES, maxDepth: MAX_DEPTH } });
      }
    } catch { /* ignore */ }

    while (queue.length > 0 && siteMap.length < MAX_PAGES) {
      const current = queue.shift()!;
      const normalized = normalizeUrl(current.url);

      if (visitedUrls.has(normalized)) continue;
      visitedUrls.add(normalized);

      // 廣播正在探索的頁面
      try {
        if (broadcast) {
          broadcast({
            type: 'deep-explore-page',
            data: {
              url: current.url,
              depth: current.depth,
              pageIndex: siteMap.length,
              status: 'navigating',
            },
          });
        }
      } catch { /* ignore */ }

      // 導航到目標頁面
      try {
        await browserService.navigateTo(sessionId, current.url);
        await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        console.warn(`[deepExplore] 無法導航到 ${current.url}:`, err);
        continue;
      }

      // 取得頁面資訊
      let pageInfo: { url: string; title: string };
      let elements: any[];
      try {
        pageInfo = await browserService.getPageInfo(sessionId);
        elements = await browserService.getInteractiveElements(sessionId);
      } catch {
        continue;
      }

      // 判斷頁面類型（純 DOM 分析，不用 AI）
      const pageType = this.classifyPage(pageInfo.url, pageInfo.title, elements);

      // 提取核心元件摘要（前 10 個有意義的元件）
      const components = elements
        .filter(el => el.text || el.placeholder || el.name)
        .slice(0, 10)
        .map(el => ({
          tag: el.tag,
          text: String(el.text || el.placeholder || el.name || '').slice(0, 30),
          type: el.type,
        }));

      const page: SiteMapPage = {
        url: pageInfo.url,
        title: pageInfo.title,
        pageType,
        fromUrl: current.fromUrl,
        fromLinkText: current.fromLinkText,
        components,
        depth: current.depth,
      };
      siteMap.push(page);

      // 廣播頁面探索完成
      try {
        if (broadcast) {
          broadcast({
            type: 'deep-explore-page',
            data: {
              url: pageInfo.url,
              title: pageInfo.title,
              depth: current.depth,
              pageIndex: siteMap.length - 1,
              pageType,
              componentCount: components.length,
              status: 'done',
            },
          });
        }
      } catch { /* ignore */ }

      // 如果還沒到最大深度，收集子頁面連結加入佇列
      if (current.depth < MAX_DEPTH && siteMap.length < MAX_PAGES) {
        const navLinks = elements.filter(el => {
          if (el.tag !== 'a') return false;
          const href = el.href || '';
          if (!href || href === '#' || href.startsWith('javascript:')) return false;
          // 同 origin 才跟
          try {
            const linkOrigin = new URL(href, pageInfo.url).origin;
            return linkOrigin === startOrigin;
          } catch { return false; }
        });

        // 取前 5 個不重複的導航連結
        const seen = new Set<string>();
        for (const link of navLinks) {
          if (seen.size >= 5) break;
          try {
            const fullUrl = new URL(link.href, pageInfo.url).href;
            const norm = normalizeUrl(fullUrl);
            if (visitedUrls.has(norm) || seen.has(norm)) continue;
            seen.add(norm);
            queue.push({
              url: fullUrl,
              depth: current.depth + 1,
              fromUrl: pageInfo.url,
              fromLinkText: String(link.text || '').slice(0, 30),
            });
          } catch { /* invalid URL */ }
        }
      }
    }

    // 探索完回到起始頁
    try {
      await browserService.navigateTo(sessionId, startUrl);
      await new Promise(r => setTimeout(r, 1000));
    } catch { /* ignore */ }

    try {
      if (broadcast) {
        broadcast({ type: 'deep-explore-done', data: { totalPages: siteMap.length } });
      }
    } catch { /* ignore */ }

    return siteMap;
  }

  /** 根據 URL、標題、元件來分類頁面類型 */
  private classifyPage(
    url: string,
    title: string,
    elements: any[]
  ): SiteMapPage['pageType'] {
    const lower = url.toLowerCase();
    const titleLower = title.toLowerCase();

    if (lower.includes('login') || lower.includes('signin') || lower.includes('auth')) return 'login';
    if (lower.includes('setting') || lower.includes('config') || lower.includes('preference')) return 'settings';
    if (lower.includes('dashboard') || lower.includes('admin')) return 'dashboard';

    // 有表單元素多 → form
    const inputs = elements.filter(el => el.tag === 'input' || el.tag === 'textarea' || el.tag === 'select');
    if (inputs.length >= 3) return 'form';

    // URL 有 id-like 路徑段 → detail
    if (/\/\d+$/.test(url) || /\/[a-f0-9-]{36}$/.test(lower) || lower.includes('/detail')) return 'detail';

    // 有分頁、多筆列表 → list
    if (lower.includes('list') || lower.includes('/search') || lower.includes('?p=') || lower.includes('?page=')) return 'list';

    return 'other';
  }

  /** 用 AI 分析前後截圖差異 */
  private async analyzeChange(
    before: string,
    after: string,
    beforeUrl: string,
    afterUrl: string,
    element: any
  ): Promise<{ type: string; description: string }> {
    // 如果 URL 變了，是 navigation
    if (afterUrl !== beforeUrl) {
      return { type: 'navigation', description: `導航到 ${afterUrl}` };
    }

    // 用 Gemini 比較兩張截圖
    // 探索階段不注入 skill（analyzeChange 只判斷 toggle/modal/nav，不需要業務知識）
    const skillHint = '';

    const prompt = `比較這兩張網頁截圖（點擊 <${element.tag}> "${element.text || element.name || ''}" 前後）。
URL 沒變（${beforeUrl}）。${skillHint}

請判斷點擊後的行為類型，只回傳 JSON：
{ "type": "toggle|modal|dropdown|no_effect", "description": "簡短描述變化（15字內）" }

toggle: 切換狀態（如暗黑模式、展開/收合）
modal: 出現彈窗/覆蓋層
dropdown: 出現下拉選單/選項列表
no_effect: 幾乎沒變化`;

    try {
      const text = await generateRuntimeText({
        prompt,
        callType: 'explore_behavior',
        maxOutputTokens: 256,
        images: [
          { mimeType: 'image/jpeg', data: before },
          { mimeType: 'image/jpeg', data: after },
        ],
      });
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return { type: 'no_effect', description: '分析失敗' };
    }
  }
}

export const explorerService = new ExplorerService();
