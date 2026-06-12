import { readFileSync } from 'node:fs';

/**
 * Single source of truth for the CLI version: package.json. Read at runtime
 * relative to this module (dist/version.js sits one level below the package
 * root, same as src/version.ts during tests).
 */
export const VERSION: string = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
).version;
