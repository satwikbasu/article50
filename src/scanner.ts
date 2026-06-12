import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import {
  CONFIDENCE_ORDER,
  DETECTORS,
  EVIDENCE_DETECTORS,
  detectorConfidence,
  type Confidence,
  type Detector,
  type DetectorKind,
} from './rules/detectors.js';
import { EMPTY_CONFIG, loadConfig, type A50Config } from './config.js';
import { analyzeImportUsage, extractImportedBindings, type ImportUsage } from './usage.js';
import type { Art50Category } from './deadlines.js';

export interface Finding {
  detectorId: string;
  title: string;
  kind: DetectorKind;
  confidence: Confidence;
  categories: Art50Category[];
  file: string;
  line: number;
  excerpt: string;
  hint: string;
  /** For SDK import matches: whether the imported binding is referenced in the file. */
  usage?: ImportUsage;
}

export interface ScanOptions {
  /** Drop findings below this confidence. */
  minConfidence?: Confidence;
  /** Override config loading (defaults to a50.config.json at the scan root). */
  config?: A50Config;
}

export interface Evidence {
  detectorId: string;
  title: string;
  categories: Art50Category[];
  file: string;
  line: number;
  excerpt: string;
}

export interface ScanResult {
  root: string;
  filesScanned: number;
  findings: Finding[];
  evidence: Evidence[];
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', 'vendor',
  '.next', '.nuxt', '.svelte-kit', '.venv', 'venv', '__pycache__',
  '.tox', 'target', '.idea', '.vscode', '.cache',
]);

const TEXT_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'vue', 'svelte', 'astro',
  'py', 'rb', 'go', 'java', 'kt', 'cs', 'php', 'rs', 'swift',
  'html', 'htm', 'md', 'mdx',
  'json', 'yaml', 'yml', 'toml', 'txt', 'env', 'mod', 'gradle', 'xml',
]);

/** Lockfiles and minified bundles produce noise, not signal. */
const SKIP_FILES = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.min\.(js|css)$)/;

const MAX_FILE_BYTES = 1_000_000;
const MAX_EXCERPT = 120;

function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env') {
        if (entry.isDirectory()) continue;
      }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).slice(1).toLowerCase();
        if (TEXT_EXTENSIONS.has(ext) && !SKIP_FILES.test(entry.name)) out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

function detectorApplies(detector: Detector, ext: string): boolean {
  return detector.extensions.length === 0 || detector.extensions.includes(ext);
}

function clean(line: string): string {
  const trimmed = line.trim();
  return trimmed.length > MAX_EXCERPT ? `${trimmed.slice(0, MAX_EXCERPT)}…` : trimmed;
}

export function scanFile(
  root: string,
  filePath: string,
  detectors: Detector[] = DETECTORS,
): { findings: Finding[]; evidence: Evidence[] } {
  const findings: Finding[] = [];
  const evidence: Evidence[] = [];
  let content: string;
  try {
    if (statSync(filePath).size > MAX_FILE_BYTES) return { findings, evidence };
    content = readFileSync(filePath, 'utf8');
  } catch {
    return { findings, evidence };
  }
  const ext = extname(filePath).slice(1).toLowerCase();
  const rel = relative(root, filePath) || filePath;
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.length > 2000) continue; // skip embedded blobs
    for (const detector of detectors) {
      if (!detectorApplies(detector, ext)) continue;
      if (detector.pattern.test(line)) {
        const finding: Finding = {
          detectorId: detector.id,
          title: detector.title,
          kind: detector.kind,
          confidence: detectorConfidence(detector),
          categories: detector.categories,
          file: rel,
          line: i + 1,
          excerpt: clean(line),
          hint: detector.hint,
        };
        // An SDK import that is never referenced again is dead weight, not an
        // AI surface — drop it below the default CI gate instead of crying wolf.
        if (detector.kind === 'sdk' && extractImportedBindings(line).length > 0) {
          finding.usage = analyzeImportUsage(content, line, i);
          if (finding.usage === 'unused') {
            finding.confidence = 'low';
            finding.hint = `${detector.hint} Imported but never used in this file — likely dead code or a stale import.`;
          }
        }
        findings.push(finding);
      }
    }
    for (const ev of EVIDENCE_DETECTORS) {
      if (ev.pattern.test(line)) {
        evidence.push({
          detectorId: ev.id,
          title: ev.title,
          categories: ev.categories,
          file: rel,
          line: i + 1,
          excerpt: clean(line),
        });
      }
    }
  }
  return { findings, evidence };
}

/** Cap repeat findings per detector+file so one chatty file doesn't flood the report. */
const MAX_PER_DETECTOR_FILE = 3;

export function scan(root: string, options: ScanOptions = {}): ScanResult {
  const config = options.config ?? safeLoadConfig(root);
  const detectors = [
    ...DETECTORS.filter((d) => !config.disableDetectors.includes(d.id)),
    ...config.customDetectors,
  ];
  const minRank = options.minConfidence ? CONFIDENCE_ORDER[options.minConfidence] : 0;

  const files = listFiles(root).filter(
    (f) => !config.ignorePaths.some((p) => relative(root, f).includes(p)),
  );
  const findings: Finding[] = [];
  const evidence: Evidence[] = [];
  const counts = new Map<string, number>();

  for (const file of files) {
    const result = scanFile(root, file, detectors);
    for (const f of result.findings) {
      if (CONFIDENCE_ORDER[f.confidence] < minRank) continue;
      const key = `${f.detectorId}:${f.file}`;
      const n = counts.get(key) ?? 0;
      if (n < MAX_PER_DETECTOR_FILE) {
        findings.push(f);
        counts.set(key, n + 1);
      }
    }
    evidence.push(...result.evidence);
  }

  return { root, filesScanned: files.length, findings, evidence };
}

/** Config errors should fail loudly; a missing file is fine (handled in loadConfig). */
function safeLoadConfig(root: string): A50Config {
  try {
    return loadConfig(root);
  } catch (err) {
    if (err instanceof Error && err.message.includes('a50.config.json')) throw err;
    return EMPTY_CONFIG;
  }
}
