import { describe, expect, it } from 'vitest';
import { extractLinks } from '../src/audit.js';

describe('extractLinks', () => {
  const html = `
    <a href="/about">About</a>
    <a href="https://example.com/pricing">Pricing</a>
    <a href="https://other.com/page">External</a>
    <a href="mailto:hi@example.com">Mail</a>
    <a href="/logo.png">Asset</a>
    <a href="/about">Duplicate</a>
    <a href="/docs#anchor-only">Docs</a>
  `;

  it('keeps same-origin pages only, deduplicated', () => {
    const links = extractLinks(html, 'https://example.com/');
    expect(links).toContain('https://example.com/about');
    expect(links).toContain('https://example.com/pricing');
    expect(links.filter((l) => l === 'https://example.com/about')).toHaveLength(1);
  });

  it('drops external links, mailto, and assets', () => {
    const links = extractLinks(html, 'https://example.com/');
    expect(links.some((l) => l.includes('other.com'))).toBe(false);
    expect(links.some((l) => l.includes('mailto'))).toBe(false);
    expect(links.some((l) => l.endsWith('.png'))).toBe(false);
  });
});
