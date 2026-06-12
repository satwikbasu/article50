import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export type Plan = 'free' | 'site' | 'team';

export interface PlanLimits {
  maxSites: number;
  minIntervalSeconds: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { maxSites: 1, minIntervalSeconds: 86_400 }, // one site, daily
  site: { maxSites: 1, minIntervalSeconds: 3_600 }, // €29/mo
  team: { maxSites: 10, minIntervalSeconds: 900 }, // €99/mo
};

export interface ApiKey {
  key: string;
  plan: Plan;
  label: string;
  createdAt: string;
}

export interface Site {
  id: string;
  ownerKey: string;
  url: string;
  intervalSeconds: number;
  webhook?: string;
  createdAt: string;
}

export interface AuditRun {
  siteId: string;
  at: string;
  passed: boolean;
  /** Failing check articles, e.g. ["Art. 50(1)"]; empty when passed or errored. */
  failing: string[];
  error?: string;
}

/**
 * File-backed store. Keys and sites are small JSON documents; audit runs are
 * an append-only JSONL file per data dir — that log is the evidence trail,
 * so nothing ever rewrites it.
 */
export class MonitorStore {
  private keys = new Map<string, ApiKey>();
  private sites = new Map<string, Site>();
  private runs: AuditRun[] = [];

  constructor(readonly dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.keys = new Map(this.loadJson<ApiKey[]>('keys.json', []).map((k) => [k.key, k]));
    this.sites = new Map(this.loadJson<Site[]>('sites.json', []).map((s) => [s.id, s]));
    const runsPath = join(dataDir, 'runs.jsonl');
    if (existsSync(runsPath)) {
      this.runs = readFileSync(runsPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as AuditRun);
    }
  }

  private loadJson<T>(name: string, fallback: T): T {
    try {
      return JSON.parse(readFileSync(join(this.dataDir, name), 'utf8')) as T;
    } catch {
      return fallback;
    }
  }

  private persistKeys(): void {
    writeFileSync(join(this.dataDir, 'keys.json'), JSON.stringify([...this.keys.values()], null, 2));
  }

  private persistSites(): void {
    writeFileSync(join(this.dataDir, 'sites.json'), JSON.stringify([...this.sites.values()], null, 2));
  }

  // ---- keys ----

  createKey(plan: Plan, label = ''): ApiKey {
    const apiKey: ApiKey = {
      key: `a50_${randomBytes(24).toString('hex')}`,
      plan,
      label,
      createdAt: new Date().toISOString(),
    };
    this.keys.set(apiKey.key, apiKey);
    this.persistKeys();
    return apiKey;
  }

  getKey(key: string): ApiKey | undefined {
    return this.keys.get(key);
  }

  setPlan(key: string, plan: Plan): ApiKey | undefined {
    const existing = this.keys.get(key);
    if (!existing) return undefined;
    existing.plan = plan;
    this.persistKeys();
    return existing;
  }

  // ---- sites ----

  listSites(ownerKey: string): Site[] {
    return [...this.sites.values()].filter((s) => s.ownerKey === ownerKey);
  }

  allSites(): Site[] {
    return [...this.sites.values()];
  }

  getSite(id: string): Site | undefined {
    return this.sites.get(id);
  }

  addSite(ownerKey: string, url: string, intervalSeconds: number, webhook?: string): Site {
    const owner = this.keys.get(ownerKey);
    if (!owner) throw new MonitorError(401, 'unknown API key');
    const limits = PLAN_LIMITS[owner.plan];
    if (this.listSites(ownerKey).length >= limits.maxSites) {
      throw new MonitorError(
        402,
        `plan "${owner.plan}" allows ${limits.maxSites} site(s) — upgrade to add more`,
      );
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new MonitorError(400, `invalid URL: ${url}`);
    }
    if (!/^https?:$/.test(parsed.protocol)) throw new MonitorError(400, 'URL must be http(s)');
    const interval = Math.max(intervalSeconds || limits.minIntervalSeconds, limits.minIntervalSeconds);
    const site: Site = {
      id: randomBytes(8).toString('hex'),
      ownerKey,
      url: parsed.toString(),
      intervalSeconds: interval,
      webhook,
      createdAt: new Date().toISOString(),
    };
    this.sites.set(site.id, site);
    this.persistSites();
    return site;
  }

  /**
   * The interval the scheduler must honor: the site's stored interval, clamped
   * to the owner's *current* plan. Keeps downgrades effective immediately
   * without rewriting sites.
   */
  effectiveIntervalSeconds(site: Site): number {
    const owner = this.keys.get(site.ownerKey);
    const min = owner ? PLAN_LIMITS[owner.plan].minIntervalSeconds : PLAN_LIMITS.free.minIntervalSeconds;
    return Math.max(site.intervalSeconds, min);
  }

  removeSite(ownerKey: string, id: string): boolean {
    const site = this.sites.get(id);
    if (!site || site.ownerKey !== ownerKey) return false;
    this.sites.delete(id);
    this.persistSites();
    return true;
  }

  // ---- runs (append-only) ----

  recordRun(run: AuditRun): void {
    this.runs.push(run);
    appendFileSync(join(this.dataDir, 'runs.jsonl'), `${JSON.stringify(run)}\n`);
  }

  runsForSite(siteId: string, limit = 500): AuditRun[] {
    const matching = this.runs.filter((r) => r.siteId === siteId);
    return matching.slice(-limit);
  }

  lastRun(siteId: string): AuditRun | undefined {
    for (let i = this.runs.length - 1; i >= 0; i--) {
      if (this.runs[i]?.siteId === siteId) return this.runs[i];
    }
    return undefined;
  }
}

export class MonitorError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Markdown evidence log an auditor can read without explanation. */
export function renderEvidence(site: Site, runs: AuditRun[]): string {
  const lines: string[] = [];
  lines.push(`# Compliance evidence log — ${site.url}`);
  lines.push('');
  lines.push(`Monitored by article50 Monitor. Site registered ${site.createdAt}; checks run every ${site.intervalSeconds}s.`);
  lines.push(`This log is append-only: ${runs.length} recorded check(s).`);
  lines.push('');
  lines.push('| Checked at (UTC) | Result | Failing obligations |');
  lines.push('| --- | --- | --- |');
  for (const run of runs) {
    const result = run.error ? 'ERROR' : run.passed ? 'PASS' : 'FAIL';
    const detail = run.error ?? (run.failing.length ? run.failing.join(', ') : '');
    lines.push(`| ${run.at} | ${result} | ${detail} |`);
  }
  lines.push('');
  lines.push('Generated by article50 — a technical aid, not legal advice.');
  lines.push('');
  return lines.join('\n');
}
