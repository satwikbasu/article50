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

  it('detects machine-readable markers independently of chat widgets', () => {
    const html = '<html><head><meta name="ai-generated" content="true"></head><body>AI-generated summary</body></html>';
    const result = auditHtml(html);
    expect(result.aiSurfaceDetected).toBe(false);
    const marking = result.checks.find((c) => c.id === 'machine-readable-marking');
    expect(marking?.passed).toBe(true);
  });
});
