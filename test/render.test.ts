import { describe, expect, it } from 'vitest';
import { createRenderedFetcher } from '../src/render.js';

function fakePlaywright(pages: string[], log: string[]) {
  return {
    chromium: {
      launch: async () => {
        log.push('launch');
        return {
          newPage: async () => {
            log.push('newPage');
            return {
              goto: async (url: string) => log.push(`goto ${url}`),
              content: async () => pages.shift() ?? '<html></html>',
              close: async () => log.push('page closed'),
            };
          },
          close: async () => {
            log.push('browser closed');
          },
        };
      },
    },
  };
}

describe('createRenderedFetcher', () => {
  it('explains how to install playwright when it is missing', async () => {
    await expect(
      createRenderedFetcher({}, async () => {
        throw new Error("Cannot find module 'playwright'");
      }),
    ).rejects.toThrow(/npm.*playwright/i);
  });

  it('returns rendered DOM content and cleans up pages and the browser', async () => {
    const log: string[] = [];
    const html = '<html><body><div class="intercom-launcher">Chat</div></body></html>';
    const { fetch, close } = await createRenderedFetcher({}, async () => fakePlaywright([html], log));

    const result = await fetch('https://spa.example');
    expect(result).toBe(html);
    expect(log).toContain('goto https://spa.example');
    expect(log).toContain('page closed');

    await close();
    expect(log).toContain('browser closed');
  });
});
