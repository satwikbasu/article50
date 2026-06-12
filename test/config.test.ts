import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { scan } from '../src/scanner.js';

function fixtureDir(config: object | string, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'a50-config-'));
  writeFileSync(join(dir, 'a50.config.json'), typeof config === 'string' ? config : JSON.stringify(config));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

describe('config', () => {
  it('returns an empty config when the file is missing', () => {
    const config = loadConfig(mkdtempSync(join(tmpdir(), 'a50-empty-')));
    expect(config.customDetectors).toHaveLength(0);
  });

  it('rejects invalid JSON and bad custom detectors', () => {
    expect(() => loadConfig(fixtureDir('{nope', {}))).toThrow(/not valid JSON/);
    expect(() =>
      loadConfig(fixtureDir({ customDetectors: [{ id: 'x', pattern: '(', categories: ['interaction'] }] }, {})),
    ).toThrow(/invalid pattern/);
    expect(() =>
      loadConfig(fixtureDir({ customDetectors: [{ id: 'x', pattern: 'ok', categories: [] }] }, {})),
    ).toThrow(/valid category/);
  });

  it('custom detectors find in-house AI endpoints', () => {
    const dir = fixtureDir(
      {
        customDetectors: [
          {
            id: 'inhouse-llm',
            title: 'In-house LLM gateway',
            pattern: 'llm-gateway\\.internal',
            categories: ['interaction'],
          },
        ],
      },
      { 'app.js': 'fetch("https://llm-gateway.internal/v1/chat")' },
    );
    const result = scan(dir);
    const hit = result.findings.find((f) => f.detectorId === 'inhouse-llm');
    expect(hit).toBeDefined();
    expect(hit?.confidence).toBe('high');
  });

  it('disableDetectors and ignorePaths suppress findings', () => {
    const dir = fixtureDir(
      { disableDetectors: ['openai-sdk'], ignorePaths: ['legacy'] },
      { 'app.py': 'from openai import OpenAI' },
    );
    expect(scan(dir).findings.filter((f) => f.detectorId === 'openai-sdk')).toHaveLength(0);
  });
});

describe('confidence filtering', () => {
  it('minConfidence drops lower-confidence findings', () => {
    const dir = mkdtempSync(join(tmpdir(), 'a50-conf-'));
    writeFileSync(join(dir, 'emotion.py'), 'result = detect_emotion(frame)  # low confidence signal');
    writeFileSync(join(dir, 'chat.py'), 'from openai import OpenAI\nclient = OpenAI()');
    const all = scan(dir);
    expect(all.findings.some((f) => f.confidence === 'low')).toBe(true);
    const filtered = scan(dir, { minConfidence: 'high' });
    expect(filtered.findings.length).toBeGreaterThan(0);
    expect(filtered.findings.every((f) => f.confidence === 'high')).toBe(true);
  });
});
