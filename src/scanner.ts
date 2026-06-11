import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { DETECTORS, EVIDENCE_DETECTORS, type Detector, type DetectorKind } from './rules/detectors.js';
import type { Art50Category } from './deadlines.js';

export interface Finding {
  detectorId: string;
  title: string;
  kind: DetectorKind;
  categories: Art50Category[];
  file: string;
  line: number;
  excerpt: string;
  hint: string;
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

export function scanFile(root: string, filePath: string): { findings: Finding[]; evidence: Evidence[] } {
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
    for (const detector of DETECTORS) {
      if (!detectorApplies(detector, ext)) continue;
      if (detector.pattern.test(line)) {
        findings.push({
          detectorId: detector.id,
          title: detector.title,
          kind: detector.kind,
          categories: detector.categories,
          file: rel,
          line: i + 1,
          excerpt: clean(line),
          hint: detector.hint,
        });
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

export function scan(root: string): ScanResult {
  const files = listFiles(root);
  const findings: Finding[] = [];
  const evidence: Evidence[] = [];
  const counts = new Map<string, number>();

  for (const file of files) {
    const result = scanFile(root, file);
    for (const f of result.findings) {
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
