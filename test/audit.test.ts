import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auditHtml } from '../src/audit.js';

const PAGES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'pages');
const read = (name: string) => readFileSync(join(PAGES, name), 'utf8');

describe('auditHtml', () => {
  it('fails a page with a chat widget and no disclosure', () => {
    const result = auditHtml(read('noncompliant.html'), 'noncompliant');
    expect(result.aiSurfaceDetected).toBe(true);
    expect(result.passed).toBe(false);
    const interaction = result.checks.find((c) => c.id === 'interaction-disclosure');
    expect(interaction?.passed).toBe(false);
  });

  it('passes a page with disclosure and machine-readable marking', () => {
    const result = auditHtml(read('compliant.html'), 'compliant');
    expect(result.passed).toBe(true);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it('passes a page with no AI signals at all instead of failing marking checks', () => {
    const html = '<html><head><title>Plain bakery site</title></head><body><h1>Fresh bread daily</h1></body></html>';
    const result = auditHtml(html, 'bakery');
    expect(result.aiSurfaceDetected).toBe(false);
    expect(result.passed).toBe(true);
    const signals = result.checks.find((c) => c.id === 'ai-content-signals');
    expect(signals?.passed).toBe(true);
    expect(signals?.detail).toMatch(/no AI/i);
  });

  it('still fails Art. 50(2) when visible AI language exists without machine-readable marking', () => {
    const html = '<html><body><p>This article was AI-generated.</p></body></html>';
    const result = auditHtml(html);
    expect(result.passed).toBe(false);
    expect(result.checks.find((c) => c.id === 'machine-readable-marking')?.passed).toBe(false);
  });

  it('detects machine-readable markers independently of chat widgets', () => {
    const html = '<html><head><meta name="ai-generated" content="true"></head><body>AI-generated summary</body></html>';
    const result = auditHtml(html);
    expect(result.aiSurfaceDetected).toBe(false);
    const marking = result.checks.find((c) => c.id === 'machine-readable-marking');
    expect(marking?.passed).toBe(true);
  });
});

describe('auditUrl with injected fetcher', () => {
  it('audits HTML produced by a custom fetcher instead of plain fetch', async () => {
    const { auditUrl } = await import('../src/audit.js');
    const html = '<html><body><script src="https://widget.intercom.io/widget/abc"></script></body></html>';
    const result = await auditUrl('https://spa.example', async () => html);
    expect(result.aiSurfaceDetected).toBe(true);
    expect(result.passed).toBe(false);
  });
});

describe('rendered-DOM widget artifacts', () => {
  it('detects mounted widget elements, not just loader script tags', () => {
    const cases = [
      '<div class="intercom-launcher">Chat</div>',
      '<div id="crisp-chatbox"></div>',
      '<div class="drift-frame-controller"></div>',
      '<div id="tidio-chat"></div>',
      '<div class="woot-widget-holder"></div>',
    ];
    for (const fragment of cases) {
      const result = auditHtml(`<html><body>${fragment}</body></html>`);
      expect(result.aiSurfaceDetected, fragment).toBe(true);
    }
  });
});
