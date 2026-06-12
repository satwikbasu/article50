import type { HtmlFetcher } from './audit.js';

/**
 * Rendered-DOM fetching via Playwright. Playwright is an optional peer
 * dependency: the raw-HTML audit must keep working on a plain install, so the
 * import happens lazily and failure produces an actionable message instead of
 * a module-resolution stack trace.
 */

export interface RenderOptions {
  /** Per-page navigation timeout. */
  timeoutMs?: number;
  /** Extra settle time after load for late-mounting widgets. */
  waitMs?: number;
}

interface PlaywrightPage {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  waitForTimeout?(ms: number): Promise<void>;
  content(): Promise<string>;
  close(): Promise<void>;
}

interface PlaywrightBrowser {
  newPage(): Promise<PlaywrightPage>;
  close(): Promise<void>;
}

interface PlaywrightModule {
  chromium: { launch(options?: { headless?: boolean }): Promise<PlaywrightBrowser> };
}

export const PLAYWRIGHT_INSTALL_HINT =
  'Rendered audits need Playwright. Install it next to article50:\n' +
  '  npm install playwright && npx playwright install chromium --with-deps\n' +
  'then re-run with --render.';

// Resolved at runtime only — playwright is optional, so the specifier is kept
// out of TypeScript's static module resolution.
const PLAYWRIGHT_MODULE = 'playwright';
const loadPlaywright = async (): Promise<PlaywrightModule> =>
  (await import(PLAYWRIGHT_MODULE)) as unknown as PlaywrightModule;

export interface RenderedFetcher {
  fetch: HtmlFetcher;
  close: () => Promise<void>;
}

/**
 * Launch a headless browser once and return a fetcher that resolves each URL
 * to its rendered DOM. Call `close()` when done.
 */
export async function createRenderedFetcher(
  options: RenderOptions = {},
  load: () => Promise<PlaywrightModule> = loadPlaywright,
): Promise<RenderedFetcher> {
  let playwright: PlaywrightModule;
  try {
    playwright = await load();
  } catch {
    throw new Error(PLAYWRIGHT_INSTALL_HINT);
  }
  const browser = await playwright.chromium.launch({ headless: true });
  const timeout = options.timeoutMs ?? 30_000;

  return {
    fetch: async (url: string): Promise<string> => {
      const page = await browser.newPage();
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout });
        if (options.waitMs && page.waitForTimeout) await page.waitForTimeout(options.waitMs);
        return await page.content();
      } finally {
        await page.close();
      }
    },
    close: () => browser.close(),
  };
}
