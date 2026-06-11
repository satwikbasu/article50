import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scan } from '../src/scanner.js';
import { classify } from '../src/classify.js';
import { renderJson, renderMarkdown, renderTerminal } from '../src/report.js';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'demo-app');
const NOW = new Date('2026-06-11T00:00:00Z');
const assessment = classify(scan(FIXTURE), NOW);

describe('report', () => {
  it('terminal report shows countdown, findings, and next steps', () => {
    const out = renderTerminal(assessment, NOW);
    expect(out).toContain('applies in 52 days (2026-08-02)');
    expect(out).toContain('ACTION REQUIRED');
    expect(out).toContain('a50 generate disclosure');
    expect(out).toContain('not legal advice');
  });

  it('markdown report includes findings table and penalty note', () => {
    const md = renderMarkdown(assessment, NOW);
    expect(md).toContain('# EU AI Act Article 50 Compliance Report');
    expect(md).toContain('| File | Line | Signal | Note |');
    expect(md).toContain('€15M');
  });

  it('json report round-trips', () => {
    const parsed = JSON.parse(renderJson(assessment));
    expect(parsed.actionRequired).toBe(true);
    expect(parsed.assessments).toHaveLength(4);
  });
});
