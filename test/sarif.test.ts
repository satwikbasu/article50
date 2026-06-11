import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scan } from '../src/scanner.js';
import { classify } from '../src/classify.js';
import { renderSarif } from '../src/sarif.js';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'demo-app');

describe('renderSarif', () => {
  const sarif = JSON.parse(renderSarif(classify(scan(FIXTURE), new Date('2026-06-11T00:00:00Z'))));

  it('emits a valid SARIF 2.1.0 skeleton', () => {
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0].tool.driver.name).toBe('article50');
    expect(sarif.runs[0].tool.driver.rules.length).toBe(4);
  });

  it('emits one result per action-required finding with file locations', () => {
    const results = sarif.runs[0].results;
    expect(results.length).toBeGreaterThan(0);
    const first = results[0];
    expect(first.ruleId).toMatch(/^Art\. 50/);
    expect(first.locations[0].physicalLocation.artifactLocation.uri).toBeTruthy();
    expect(first.locations[0].physicalLocation.region.startLine).toBeGreaterThan(0);
  });
});
