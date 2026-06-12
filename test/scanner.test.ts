import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scan } from '../src/scanner.js';
import { classify } from '../src/classify.js';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'demo-app');

describe('scanner', () => {
  const result = scan(FIXTURE);

  it('scans the fixture files', () => {
    expect(result.filesScanned).toBeGreaterThanOrEqual(4);
  });

  it('detects the OpenAI SDK with file and line', () => {
    const hit = result.findings.find((f) => f.detectorId === 'openai-sdk');
    expect(hit).toBeDefined();
    expect(hit?.file).toContain('chat.ts');
    expect(hit?.line).toBeGreaterThan(0);
  });

  it('detects the Vercel AI SDK chat surface', () => {
    expect(result.findings.some((f) => f.detectorId === 'vercel-ai')).toBe(true);
  });

  it('detects AI dependencies in package.json', () => {
    expect(
      result.findings.some((f) => f.detectorId === 'manifest-ai-dep' && f.file.endsWith('package.json')),
    ).toBe(true);
  });

  it('detects audio generation APIs in Python', () => {
    expect(result.findings.some((f) => f.detectorId === 'audio-gen' && f.file.endsWith('voiceover.py'))).toBe(true);
  });

  it('finds no compliance evidence in the fixture', () => {
    expect(result.evidence).toHaveLength(0);
  });
});

describe('classify', () => {
  const assessment = classify(scan(FIXTURE), new Date('2026-06-11T00:00:00Z'));

  it('requires action for interaction and synthetic-content obligations', () => {
    const byCat = Object.fromEntries(assessment.assessments.map((a) => [a.obligation.category, a]));
    expect(byCat['interaction']?.status).toBe('action-required');
    expect(byCat['synthetic-content']?.status).toBe('action-required');
    expect(byCat['emotion-biometric']?.status).toBe('not-applicable');
    expect(assessment.actionRequired).toBe(true);
  });

  it('computes days remaining from the reference date', () => {
    const interaction = assessment.assessments.find((a) => a.obligation.category === 'interaction');
    expect(interaction?.daysRemaining).toBe(52);
  });

  it('moves to review-evidence when disclosure markup exists', () => {
    const result = scan(FIXTURE);
    result.evidence.push({
      detectorId: 'disclosure-markup',
      title: 'AI disclosure markup',
      categories: ['interaction'],
      file: 'src/banner.tsx',
      line: 1,
      excerpt: 'data-ai-disclosure',
    });
    const reassessed = classify(result);
    const interaction = reassessed.assessments.find((a) => a.obligation.category === 'interaction');
    expect(interaction?.status).toBe('review-evidence');
  });
});

describe('import usage downgrades', () => {
  const dir = mkdtempSync(join(tmpdir(), 'a50-usage-'));
  writeFileSync(join(dir, 'unused.ts'), "import OpenAI from 'openai';\nexport const x = 1;\n");
  writeFileSync(join(dir, 'used.ts'), "import OpenAI from 'openai';\nexport const c = new OpenAI();\n");
  const result = scan(dir);

  it('downgrades an imported-but-unused SDK to low confidence', () => {
    const finding = result.findings.find((f) => f.file === 'unused.ts');
    expect(finding?.confidence).toBe('low');
    expect(finding?.usage).toBe('unused');
    expect(finding?.hint).toMatch(/imported but never used/i);
  });

  it('keeps a used SDK at high confidence', () => {
    const finding = result.findings.find((f) => f.file === 'used.ts');
    expect(finding?.confidence).toBe('high');
    expect(finding?.usage).toBe('used');
  });

  it('drops unused imports below the default CI gate', () => {
    const gated = scan(dir, { minConfidence: 'high' });
    expect(gated.findings.some((f) => f.file === 'unused.ts')).toBe(false);
    expect(gated.findings.some((f) => f.file === 'used.ts')).toBe(true);
  });
});
