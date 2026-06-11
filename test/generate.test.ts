import { describe, expect, it } from 'vitest';
import {
  DISCLOSURE_STRINGS,
  disclosureHtml,
  disclosureReact,
  markHtml,
  markingHtml,
  policyMarkdown,
} from '../src/generate.js';
import { auditHtml } from '../src/audit.js';

describe('generate', () => {
  it('produces localized disclosure banners', () => {
    expect(disclosureHtml('de')).toContain('KI-System');
    expect(disclosureHtml('fr')).toContain("d'IA");
    expect(disclosureHtml('xx')).toContain(DISCLOSURE_STRINGS.en); // unknown lang falls back
    expect(disclosureHtml('en')).toContain('data-ai-disclosure');
  });

  it('produces a React component with the disclosure attribute', () => {
    const component = disclosureReact('en');
    expect(component).toContain('data-ai-disclosure');
    expect(component).toContain('export function AiDisclosure');
  });

  it('embeds model and provider in marking metadata', () => {
    const marking = markingHtml({ model: 'gpt-4o', provider: 'openai' });
    expect(marking).toContain('"a50:model": "gpt-4o"');
    expect(marking).toContain('trainedAlgorithmicMedia');
  });

  it('markHtml injects into <head> and satisfies the auditor', () => {
    const marked = markHtml('<html><head><title>x</title></head><body></body></html>');
    expect(marked).toContain('<meta name="ai-generated" content="true">');
    const result = auditHtml(marked);
    expect(result.checks.find((c) => c.id === 'machine-readable-marking')?.passed).toBe(true);
  });

  it('markHtml prepends when no <head> exists', () => {
    const marked = markHtml('<p>hello</p>');
    expect(marked.startsWith('<!-- EU AI Act')).toBe(true);
  });

  it('policy lists every obligation with its deadline', () => {
    const policy = policyMarkdown('Acme', new Date('2026-06-11T00:00:00Z'));
    expect(policy).toContain('Art. 50(1)');
    expect(policy).toContain('Art. 50(2)');
    expect(policy).toContain('2026-12-02');
    expect(policy).toContain('Acme');
  });
});
