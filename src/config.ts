import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Art50Category } from './deadlines.js';
import type { Confidence, Detector, DetectorKind } from './rules/detectors.js';

export const CONFIG_FILENAME = 'a50.config.json';

const VALID_CATEGORIES = new Set<Art50Category>([
  'interaction',
  'synthetic-content',
  'emotion-biometric',
  'deepfake-text',
]);
const VALID_KINDS = new Set<DetectorKind>(['sdk', 'http-api', 'ui-widget', 'dependency']);
const VALID_CONFIDENCE = new Set<Confidence>(['high', 'medium', 'low']);

export interface CustomDetectorConfig {
  id: string;
  title?: string;
  /** Regular expression source, compiled case-insensitively. */
  pattern: string;
  categories: Art50Category[];
  kind?: DetectorKind;
  confidence?: Confidence;
  hint?: string;
  /** File extensions (without dot); omit to match all text files. */
  extensions?: string[];
}

export interface A50Config {
  /** Path substrings to skip during scanning (matched against relative paths). */
  ignorePaths: string[];
  /** Built-in detector ids to disable. */
  disableDetectors: string[];
  /** In-house AI endpoints/wrappers the built-in signatures can't know about. */
  customDetectors: Detector[];
}

export const EMPTY_CONFIG: A50Config = { ignorePaths: [], disableDetectors: [], customDetectors: [] };

function asStringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new Error(`${CONFIG_FILENAME}: "${field}" must be an array of strings`);
  }
  return value as string[];
}

function compileCustomDetector(raw: CustomDetectorConfig, index: number): Detector {
  if (!raw.id || !raw.pattern) {
    throw new Error(`${CONFIG_FILENAME}: customDetectors[${index}] needs "id" and "pattern"`);
  }
  const categories = (raw.categories ?? []).filter((c) => VALID_CATEGORIES.has(c));
  if (categories.length === 0) {
    throw new Error(
      `${CONFIG_FILENAME}: customDetectors[${index}] ("${raw.id}") needs at least one valid category: ${[...VALID_CATEGORIES].join(', ')}`,
    );
  }
  let pattern: RegExp;
  try {
    pattern = new RegExp(raw.pattern, 'i');
  } catch (err) {
    throw new Error(
      `${CONFIG_FILENAME}: customDetectors[${index}] ("${raw.id}") has an invalid pattern: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return {
    id: raw.id,
    title: raw.title ?? raw.id,
    extensions: raw.extensions ?? [],
    pattern,
    categories,
    kind: raw.kind && VALID_KINDS.has(raw.kind) ? raw.kind : 'http-api',
    confidence: raw.confidence && VALID_CONFIDENCE.has(raw.confidence) ? raw.confidence : 'high',
    hint: raw.hint ?? `Custom AI surface declared in ${CONFIG_FILENAME}.`,
  };
}

/** Load a50.config.json from `root`. Missing file → empty config; invalid file → throws. */
export function loadConfig(root: string): A50Config {
  let text: string;
  try {
    text = readFileSync(join(root, CONFIG_FILENAME), 'utf8');
  } catch {
    return EMPTY_CONFIG;
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`${CONFIG_FILENAME} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const customRaw = (raw.customDetectors ?? []) as CustomDetectorConfig[];
  if (!Array.isArray(customRaw)) {
    throw new Error(`${CONFIG_FILENAME}: "customDetectors" must be an array`);
  }
  return {
    ignorePaths: asStringArray(raw.ignorePaths, 'ignorePaths'),
    disableDetectors: asStringArray(raw.disableDetectors, 'disableDetectors'),
    customDetectors: customRaw.map(compileCustomDetector),
  };
}
