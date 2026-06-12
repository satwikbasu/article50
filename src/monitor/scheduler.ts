import { auditUrl, type AuditResult } from '../audit.js';
import type { AuditRun, MonitorStore, Site } from './store.js';

export type AuditFn = (url: string) => Promise<AuditResult>;
export type AlertFn = (webhook: string, text: string) => Promise<void>;

export async function defaultAlert(webhook: string, text: string): Promise<void> {
  await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
  });
}

/** Run one audit for a site, persist the run, alert when the failure set changes. */
export async function runSiteCheck(
  store: MonitorStore,
  site: Site,
  auditFn: AuditFn = auditUrl,
  alertFn: AlertFn = defaultAlert,
): Promise<AuditRun> {
  const previous = store.lastRun(site.id);
  let run: AuditRun;
  try {
    const result = await auditFn(site.url);
    run = {
      siteId: site.id,
      at: new Date().toISOString(),
      passed: result.passed,
      failing: result.checks.filter((c) => !c.passed).map((c) => c.article).sort(),
    };
  } catch (err) {
    run = {
      siteId: site.id,
      at: new Date().toISOString(),
      passed: false,
      failing: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
  store.recordRun(run);

  const previousSignature = previous ? (previous.error ?? previous.failing.join(',')) : '';
  const signature = run.error ?? run.failing.join(',');
  const regressed = signature !== '' && signature !== previousSignature;
  if (regressed && site.webhook) {
    const detail = run.error ?? `failing: ${run.failing.join(', ')}`;
    try {
      await alertFn(
        site.webhook,
        `article50 Monitor: transparency regression on ${site.url} — ${detail} (EU AI Act Article 50)`,
      );
    } catch {
      // alert delivery is best-effort; the run itself is already recorded
    }
  }
  return run;
}

export interface SchedulerOptions {
  tickMs?: number;
  auditFn?: AuditFn;
  alertFn?: AlertFn;
  log?: (line: string) => void;
}

/**
 * One timer drives everything: every tick, run checks for sites that are due.
 * Returns a stop function.
 */
export function startScheduler(store: MonitorStore, options: SchedulerOptions = {}): () => void {
  const tickMs = options.tickMs ?? 15_000;
  const log = options.log ?? (() => undefined);
  const nextDue = new Map<string, number>();
  let running = false;

  const tick = async () => {
    if (running) return; // never overlap ticks
    running = true;
    try {
      const now = Date.now();
      for (const site of store.allSites()) {
        const due = nextDue.get(site.id) ?? 0;
        if (now < due) continue;
        nextDue.set(site.id, now + store.effectiveIntervalSeconds(site) * 1000);
        const run = await runSiteCheck(store, site, options.auditFn, options.alertFn);
        log(
          `[${run.at}] ${run.error ? 'ERROR' : run.passed ? 'PASS' : 'FAIL'} ${site.url}${
            run.failing.length ? ` (${run.failing.join(', ')})` : ''
          }${run.error ? ` (${run.error})` : ''}`,
        );
      }
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), tickMs);
  void tick();
  return () => clearInterval(timer);
}
