/**
 * Import-usage analysis: given a file and a matched import line, decide
 * whether the imported binding is actually referenced afterwards. Regex
 * tokenization, not a real parser — the goal is to stop calling an SDK that
 * is imported and never touched a "high confidence AI surface", not to be a
 * type checker. Unknown beats wrong: anything unparseable stays as-is.
 */

export type ImportUsage = 'used' | 'unused' | 'unknown';

const JS_PATTERNS: RegExp[] = [
  // import Default from '...'
  /^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]/,
  // import * as ns from '...'
  /^\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+['"]/,
  // const x = require('...') / const { a, b } = require('...')
  /^\s*(?:const|let|var)\s+(\{[^}]+\}|[A-Za-z_$][\w$]*)\s*=\s*require\(/,
];

// import { a, b as c } from '...'
const JS_NAMED = /^\s*import\s+(?:type\s+)?\{([^}]+)\}\s*from\s+['"]/;

const PY_PATTERNS: RegExp[] = [
  // from mod import name [as alias]
  /^\s*from\s+[\w.]+\s+import\s+([\w]+)(?:\s+as\s+([\w]+))?\s*$/,
  // import mod [as alias]
  /^\s*import\s+([\w]+)(?:\s+as\s+([\w]+))?\s*$/,
];

function namedList(group: string): string[] {
  return group
    .split(',')
    .map((part) => {
      const alias = part.match(/\bas\s+([A-Za-z_$][\w$]*)/);
      return (alias ? alias[1] : part.trim().split(/\s+/)[0]) ?? '';
    })
    .filter(Boolean);
}

/** Binding names a matched import/require line introduces into the file. */
export function extractImportedBindings(line: string): string[] {
  const named = line.match(JS_NAMED);
  if (named?.[1]) return namedList(named[1]);

  for (const re of JS_PATTERNS) {
    const m = line.match(re);
    if (!m?.[1]) continue;
    return m[1].startsWith('{') ? namedList(m[1].slice(1, -1)) : [m[1]];
  }
  for (const re of PY_PATTERNS) {
    const m = line.match(re);
    if (m?.[1]) return [m[2] ?? m[1]];
  }
  return [];
}

const IMPORT_LINE = /^\s*(import\s|from\s+[\w.@/'"-]+\s+import\s|(?:const|let|var)\s+[^=]+=\s*require\()/;
const COMMENT_LINE = /^\s*(\/\/|#|\*|\/\*)/;

/**
 * Decide whether the bindings introduced by `importLine` (at `importLineIndex`)
 * are referenced anywhere else in `content`. Other imports and comments don't
 * count as usage.
 */
export function analyzeImportUsage(content: string, importLine: string, importLineIndex: number): ImportUsage {
  const bindings = extractImportedBindings(importLine);
  if (bindings.length === 0) return 'unknown';

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (i === importLineIndex) continue;
    const line = lines[i] ?? '';
    if (IMPORT_LINE.test(line) || COMMENT_LINE.test(line)) continue;
    for (const binding of bindings) {
      if (new RegExp(`\\b${binding}\\b`).test(line)) return 'used';
    }
  }
  return 'unused';
}
