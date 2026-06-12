import { describe, expect, it } from 'vitest';
import { analyzeImportUsage, extractImportedBindings } from '../src/usage.js';

describe('extractImportedBindings', () => {
  it('extracts default, named, namespace, and require bindings (JS/TS)', () => {
    expect(extractImportedBindings("import OpenAI from 'openai';")).toEqual(['OpenAI']);
    expect(extractImportedBindings("import { Anthropic, HUMAN_PROMPT } from '@anthropic-ai/sdk';")).toEqual([
      'Anthropic',
      'HUMAN_PROMPT',
    ]);
    expect(extractImportedBindings("import * as openai from 'openai';")).toEqual(['openai']);
    expect(extractImportedBindings("const openai = require('openai');")).toEqual(['openai']);
    expect(extractImportedBindings("const { OpenAI } = require('openai');")).toEqual(['OpenAI']);
  });

  it('extracts Python import bindings including aliases', () => {
    expect(extractImportedBindings('import openai')).toEqual(['openai']);
    expect(extractImportedBindings('from openai import OpenAI')).toEqual(['OpenAI']);
    expect(extractImportedBindings('import anthropic as ai')).toEqual(['ai']);
    expect(extractImportedBindings('from openai import OpenAI as Client')).toEqual(['Client']);
  });

  it('returns nothing for non-import lines', () => {
    expect(extractImportedBindings('const x = new OpenAI();')).toEqual([]);
    expect(extractImportedBindings('fetch("https://api.openai.com/v1/chat")')).toEqual([]);
  });
});

describe('analyzeImportUsage', () => {
  it('reports used when the binding is referenced after the import', () => {
    const content = ["import OpenAI from 'openai';", 'const client = new OpenAI();', 'client.chat();'].join('\n');
    expect(analyzeImportUsage(content, "import OpenAI from 'openai';", 0)).toBe('used');
  });

  it('reports unused when the binding never appears again', () => {
    const content = ["import OpenAI from 'openai';", 'export const answer = 42;'].join('\n');
    expect(analyzeImportUsage(content, "import OpenAI from 'openai';", 0)).toBe('unused');
  });

  it('does not count other import lines or comments as usage', () => {
    const content = [
      "import OpenAI from 'openai';",
      "import type { OpenAI as T } from 'openai';",
      '// TODO: wire up OpenAI later',
      'export {};',
    ].join('\n');
    expect(analyzeImportUsage(content, "import OpenAI from 'openai';", 0)).toBe('unused');
  });

  it('reports unknown for lines it cannot parse bindings from', () => {
    const content = 'client = openai_call()';
    expect(analyzeImportUsage(content, 'client = openai_call()', 0)).toBe('unknown');
  });

  it('handles Python module usage', () => {
    const used = ['import openai', 'resp = openai.chat.completions.create()'].join('\n');
    expect(analyzeImportUsage(used, 'import openai', 0)).toBe('used');
    const unused = ['import openai', 'print("hello")'].join('\n');
    expect(analyzeImportUsage(unused, 'import openai', 0)).toBe('unused');
  });
});
