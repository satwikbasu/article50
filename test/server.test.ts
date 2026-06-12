import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MonitorStore } from '../src/monitor/store.js';
import { createMonitorServer, verifyStripeSignature } from '../src/monitor/server.js';

const STRIPE_SECRET = 'whsec_test';
let base = '';
let adminToken = '';
let store: MonitorStore;
let close: () => void;

beforeAll(async () => {
  store = new MonitorStore(mkdtempSync(join(tmpdir(), 'a50-server-')));
  const created = createMonitorServer({ store, stripeWebhookSecret: STRIPE_SECRET });
  adminToken = created.adminToken;
  await new Promise<void>((resolveListen) => created.server.listen(0, resolveListen));
  base = `http://127.0.0.1:${(created.server.address() as AddressInfo).port}`;
  close = () => created.server.close();
});

afterAll(() => close());

async function api(path: string, init: RequestInit = {}): Promise<{ status: number; body: string }> {
  const res = await fetch(`${base}${path}`, init);
  return { status: res.status, body: await res.text() };
}

describe('monitor server', () => {
  let customerKey = '';
  let siteId = '';

  it('serves health and landing pages without auth', async () => {
    expect((await api('/healthz')).status).toBe(200);
    expect((await api('/')).body).toContain('article50 Monitor');
  });

  it('rejects key creation without the admin token', async () => {
    expect((await api('/v1/keys', { method: 'POST', body: '{}' })).status).toBe(401);
  });

  it('creates an API key with the admin token', async () => {
    const res = await api('/v1/keys', {
      method: 'POST',
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ plan: 'site', label: 'acme' }),
    });
    expect(res.status).toBe(201);
    customerKey = (JSON.parse(res.body) as { key: string }).key;
    expect(customerKey).toMatch(/^a50_/);
  });

  it('registers a site and lists it', async () => {
    const auth = { authorization: `Bearer ${customerKey}` };
    const created = await api('/v1/sites', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ url: 'https://example.com', intervalSeconds: 3600 }),
    });
    expect(created.status).toBe(201);
    siteId = (JSON.parse(created.body) as { id: string }).id;

    const listed = await api('/v1/sites', { headers: auth });
    const parsed = JSON.parse(listed.body) as { sites: Array<{ id: string }>; plan: string };
    expect(parsed.plan).toBe('site');
    expect(parsed.sites.map((s) => s.id)).toContain(siteId);
  });

  it('enforces plan limits over HTTP with a 402', async () => {
    const res = await api('/v1/sites', {
      method: 'POST',
      headers: { authorization: `Bearer ${customerKey}` },
      body: JSON.stringify({ url: 'https://two.example.com' }),
    });
    expect(res.status).toBe(402);
  });

  it('serves runs and the markdown evidence log', async () => {
    store.recordRun({ siteId, at: '2026-06-11T10:00:00Z', passed: false, failing: ['Art. 50(1)'] });
    const auth = { authorization: `Bearer ${customerKey}` };
    const runs = await api(`/v1/sites/${siteId}/runs`, { headers: auth });
    expect(JSON.parse(runs.body).runs).toHaveLength(1);
    const evidence = await api(`/v1/sites/${siteId}/evidence`, { headers: auth });
    expect(evidence.body).toContain('Compliance evidence log');
    expect(evidence.body).toContain('Art. 50(1)');
  });

  it('hides other customers’ sites', async () => {
    const otherKeyRes = await api('/v1/keys', {
      method: 'POST',
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ plan: 'free' }),
    });
    const otherKey = (JSON.parse(otherKeyRes.body) as { key: string }).key;
    const res = await api(`/v1/sites/${siteId}/runs`, { headers: { authorization: `Bearer ${otherKey}` } });
    expect(res.status).toBe(404);
  });

  it('upgrades a plan via a signed Stripe webhook and rejects bad signatures', async () => {
    const event = JSON.stringify({
      type: 'checkout.session.completed',
      data: { object: { metadata: { a50_key: customerKey, a50_plan: 'team' } } },
    });
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', STRIPE_SECRET).update(`${t}.${event}`).digest('hex');

    const bad = await api('/v1/billing/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': `t=${t},v1=deadbeef` },
      body: event,
    });
    expect(bad.status).toBe(400);

    const good = await api('/v1/billing/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': `t=${t},v1=${v1}` },
      body: event,
    });
    expect(good.status).toBe(200);
    expect(store.getKey(customerKey)?.plan).toBe('team');

    // team plan now allows a second site
    const res = await api('/v1/sites', {
      method: 'POST',
      headers: { authorization: `Bearer ${customerKey}` },
      body: JSON.stringify({ url: 'https://two.example.com' }),
    });
    expect(res.status).toBe(201);
  });

  it('downgrades a key to free when its Stripe subscription is deleted', async () => {
    const event = JSON.stringify({
      type: 'customer.subscription.deleted',
      data: { object: { metadata: { a50_key: customerKey } } },
    });
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', STRIPE_SECRET).update(`${t}.${event}`).digest('hex');

    const res = await api('/v1/billing/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': `t=${t},v1=${v1}` },
      body: event,
    });
    expect(res.status).toBe(200);
    expect(store.getKey(customerKey)?.plan).toBe('free');

    // free plan blocks adding more sites again
    const blocked = await api('/v1/sites', {
      method: 'POST',
      headers: { authorization: `Bearer ${customerKey}` },
      body: JSON.stringify({ url: 'https://three.example.com' }),
    });
    expect(blocked.status).toBe(402);
  });
});

describe('verifyStripeSignature', () => {
  it('rejects stale timestamps', () => {
    const payload = '{}';
    const t = Math.floor(Date.now() / 1000) - 3600;
    const v1 = createHmac('sha256', STRIPE_SECRET).update(`${t}.${payload}`).digest('hex');
    expect(verifyStripeSignature(payload, `t=${t},v1=${v1}`, STRIPE_SECRET)).toBe(false);
  });
});
