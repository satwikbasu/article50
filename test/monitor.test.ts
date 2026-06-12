import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MonitorStore, PLAN_LIMITS, renderEvidence } from '../src/monitor/store.js';
import { runSiteCheck } from '../src/monitor/scheduler.js';
import type { AuditResult } from '../src/audit.js';

const dir = () => mkdtempSync(join(tmpdir(), 'a50-monitor-'));

function auditResult(passed: boolean, failingArticles: string[] = []): AuditResult {
  return {
    target: 'x',
    aiSurfaceDetected: true,
    passed,
    checks: failingArticles.length
      ? failingArticles.map((article, i) => ({ id: `c${i}`, title: 't', article, passed: false, detail: '' }))
      : [{ id: 'c0', title: 't', article: 'Art. 50(1)', passed: true, detail: '' }],
  };
}

describe('MonitorStore', () => {
  it('enforces plan site limits', () => {
    const store = new MonitorStore(dir());
    const key = store.createKey('free');
    store.addSite(key.key, 'https://a.example', 0);
    expect(() => store.addSite(key.key, 'https://b.example', 0)).toThrow(/allows 1 site/);
  });

  it('enforces plan minimum intervals', () => {
    const store = new MonitorStore(dir());
    const key = store.createKey('free');
    const site = store.addSite(key.key, 'https://a.example', 60);
    expect(site.intervalSeconds).toBe(PLAN_LIMITS.free.minIntervalSeconds);
    const teamKey = store.createKey('team');
    const teamSite = store.addSite(teamKey.key, 'https://b.example', 60);
    expect(teamSite.intervalSeconds).toBe(PLAN_LIMITS.team.minIntervalSeconds);
  });

  it('rejects bad URLs and unknown keys', () => {
    const store = new MonitorStore(dir());
    const key = store.createKey('site');
    expect(() => store.addSite(key.key, 'not a url', 0)).toThrow(/invalid URL/);
    expect(() => store.addSite('a50_nope', 'https://a.example', 0)).toThrow(/unknown API key/);
  });

  it('persists keys, sites, and runs across restarts', () => {
    const dataDir = dir();
    const store = new MonitorStore(dataDir);
    const key = store.createKey('team', 'acme');
    const site = store.addSite(key.key, 'https://a.example', 3600);
    store.recordRun({ siteId: site.id, at: '2026-06-11T00:00:00Z', passed: true, failing: [] });

    const reopened = new MonitorStore(dataDir);
    expect(reopened.getKey(key.key)?.plan).toBe('team');
    expect(reopened.getSite(site.id)?.url).toBe('https://a.example/');
    expect(reopened.runsForSite(site.id)).toHaveLength(1);
    expect(reopened.lastRun(site.id)?.passed).toBe(true);
  });

  it('plan upgrades stick', () => {
    const store = new MonitorStore(dir());
    const key = store.createKey('free');
    store.setPlan(key.key, 'team');
    expect(store.getKey(key.key)?.plan).toBe('team');
  });

  it('clamps the effective interval to the owner’s current plan after a downgrade', () => {
    const store = new MonitorStore(dir());
    const key = store.createKey('team');
    const site = store.addSite(key.key, 'https://a.example', 900);
    expect(store.effectiveIntervalSeconds(site)).toBe(900);
    store.setPlan(key.key, 'free');
    expect(store.effectiveIntervalSeconds(site)).toBe(PLAN_LIMITS.free.minIntervalSeconds);
  });
});

describe('runSiteCheck', () => {
  it('records runs and alerts only when the failure set changes', async () => {
    const store = new MonitorStore(dir());
    const key = store.createKey('team');
    const site = store.addSite(key.key, 'https://a.example', 900, 'https://hooks.example/x');
    const alerts: string[] = [];
    const alertFn = async (_webhook: string, text: string) => {
      alerts.push(text);
    };

    await runSiteCheck(store, site, async () => auditResult(true), alertFn);
    expect(alerts).toHaveLength(0); // passing → no alert

    await runSiteCheck(store, site, async () => auditResult(false, ['Art. 50(1)']), alertFn);
    expect(alerts).toHaveLength(1); // regression → alert
    expect(alerts[0]).toContain('Art. 50(1)');

    await runSiteCheck(store, site, async () => auditResult(false, ['Art. 50(1)']), alertFn);
    expect(alerts).toHaveLength(1); // same failure → no repeat alert

    expect(store.runsForSite(site.id)).toHaveLength(3);
  });

  it('records audit errors as runs', async () => {
    const store = new MonitorStore(dir());
    const key = store.createKey('site');
    const site = store.addSite(key.key, 'https://a.example', 3600);
    const run = await runSiteCheck(store, site, async () => {
      throw new Error('boom');
    });
    expect(run.error).toBe('boom');
    expect(store.lastRun(site.id)?.error).toBe('boom');
  });
});

describe('renderEvidence', () => {
  it('produces a readable append-only log', () => {
    const store = new MonitorStore(dir());
    const key = store.createKey('site');
    const site = store.addSite(key.key, 'https://a.example', 3600);
    store.recordRun({ siteId: site.id, at: '2026-06-11T00:00:00Z', passed: true, failing: [] });
    store.recordRun({ siteId: site.id, at: '2026-06-12T00:00:00Z', passed: false, failing: ['Art. 50(2)'] });
    const md = renderEvidence(site, store.runsForSite(site.id));
    expect(md).toContain('append-only: 2 recorded check(s)');
    expect(md).toContain('| 2026-06-11T00:00:00Z | PASS |');
    expect(md).toContain('| 2026-06-12T00:00:00Z | FAIL | Art. 50(2) |');
  });
});
