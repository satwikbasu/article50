import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { MonitorError, MonitorStore, PLAN_LIMITS, renderEvidence, type Plan } from './store.js';

export interface MonitorServerOptions {
  store: MonitorStore;
  /** Token for key-management endpoints. Generated and logged when omitted. */
  adminToken?: string;
  /** Stripe webhook signing secret; upgrades are rejected without it unless allowInsecureStripe. */
  stripeWebhookSecret?: string;
  /** Accept unsigned Stripe events (local development only). */
  allowInsecureStripe?: boolean;
  log?: (line: string) => void;
}

interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  body: string;
}

const VALID_PLANS = new Set<Plan>(['free', 'site', 'team']);

function json(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body);
}

function bearer(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

async function readBody(req: IncomingMessage, limit = 256 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new MonitorError(413, 'request body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Verify a Stripe-Signature header (t=...,v1=... HMAC-SHA256 scheme). */
export function verifyStripeSignature(payload: string, header: string, secret: string, toleranceSeconds = 300): boolean {
  const parts = new Map(
    header.split(',').map((p) => {
      const idx = p.indexOf('=');
      return [p.slice(0, idx).trim(), p.slice(idx + 1)] as const;
    }),
  );
  const timestamp = Number(parts.get('t'));
  const signature = parts.get('v1');
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createMonitorServer(options: MonitorServerOptions): { server: Server; adminToken: string } {
  const { store } = options;
  const log = options.log ?? (() => undefined);
  const adminToken = options.adminToken ?? `a50adm_${randomBytes(24).toString('hex')}`;

  const handle = async (ctx: Ctx): Promise<void> => {
    const { req, res, url, body } = ctx;
    const route = `${req.method} ${url.pathname}`;

    if (route === 'GET /healthz') {
      return json(res, 200, { ok: true, sites: store.allSites().length });
    }

    if (route === 'GET /') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(
        [
          'article50 Monitor — EU AI Act Article 50 compliance monitoring',
          '',
          'API:',
          '  POST   /v1/sites                  {url, intervalSeconds?, webhook?, render?}   (Bearer API key)',
          '  GET    /v1/sites                                                       (Bearer API key)',
          '  DELETE /v1/sites/:id                                                   (Bearer API key)',
          '  GET    /v1/sites/:id/runs                                              (Bearer API key)',
          '  GET    /v1/sites/:id/evidence                                          (Bearer API key)',
          '  POST   /v1/keys                   {plan, label?}                       (Bearer admin token)',
          '  POST   /v1/billing/stripe         Stripe webhook (checkout.session.completed, customer.subscription.deleted)',
          '',
          'Plans: free (1 site, daily) · site €29/mo (1 site, hourly) · team €99/mo (10 sites, 15 min)',
          'Docs: https://github.com/satwikbasu/article50',
        ].join('\n'),
      );
      return;
    }

    // ---- admin: key management ----
    if (route === 'POST /v1/keys') {
      if (bearer(req) !== adminToken) throw new MonitorError(401, 'admin token required');
      const parsed = JSON.parse(body || '{}') as { plan?: Plan; label?: string };
      const plan = parsed.plan ?? 'free';
      if (!VALID_PLANS.has(plan)) throw new MonitorError(400, `plan must be one of: free, site, team`);
      const key = store.createKey(plan, parsed.label ?? '');
      log(`created ${plan} key (${key.label || 'unlabelled'})`);
      return json(res, 201, { ...key, limits: PLAN_LIMITS[plan] });
    }

    // ---- billing: Stripe checkout completion upgrades the key's plan ----
    if (route === 'POST /v1/billing/stripe') {
      const signature = req.headers['stripe-signature'];
      if (options.stripeWebhookSecret) {
        if (typeof signature !== 'string' || !verifyStripeSignature(body, signature, options.stripeWebhookSecret)) {
          throw new MonitorError(400, 'invalid Stripe signature');
        }
      } else if (!options.allowInsecureStripe) {
        throw new MonitorError(503, 'Stripe webhook secret not configured');
      }
      const event = JSON.parse(body || '{}') as {
        type?: string;
        data?: { object?: { metadata?: { a50_key?: string; a50_plan?: Plan } } };
      };
      if (event.type === 'checkout.session.completed') {
        const meta = event.data?.object?.metadata;
        const plan = meta?.a50_plan;
        if (meta?.a50_key && plan && VALID_PLANS.has(plan)) {
          const updated = store.setPlan(meta.a50_key, plan);
          log(updated ? `upgraded key to ${plan}` : `stripe event referenced unknown key`);
        }
      }
      if (event.type === 'customer.subscription.deleted') {
        const meta = event.data?.object?.metadata;
        if (meta?.a50_key) {
          const updated = store.setPlan(meta.a50_key, 'free');
          log(updated ? 'subscription cancelled — key downgraded to free' : `stripe event referenced unknown key`);
        }
      }
      return json(res, 200, { received: true });
    }

    // ---- everything below requires a customer API key ----
    const key = bearer(req);
    const apiKey = key ? store.getKey(key) : undefined;
    if (!apiKey) throw new MonitorError(401, 'API key required (Authorization: Bearer a50_...)');

    if (route === 'GET /v1/sites') {
      const sites = store.listSites(apiKey.key).map((s) => ({ ...s, ownerKey: undefined, lastRun: store.lastRun(s.id) }));
      return json(res, 200, { plan: apiKey.plan, limits: PLAN_LIMITS[apiKey.plan], sites });
    }

    if (route === 'POST /v1/sites') {
      const parsed = JSON.parse(body || '{}') as {
        url?: string;
        intervalSeconds?: number;
        webhook?: string;
        render?: boolean;
      };
      if (!parsed.url) throw new MonitorError(400, '"url" is required');
      const site = store.addSite(apiKey.key, parsed.url, parsed.intervalSeconds ?? 0, parsed.webhook, parsed.render === true);
      log(`monitoring ${site.url} every ${site.intervalSeconds}s${site.render ? ' (rendered)' : ''}`);
      return json(res, 201, { ...site, ownerKey: undefined });
    }

    const siteMatch = url.pathname.match(/^\/v1\/sites\/([a-f0-9]+)(\/runs|\/evidence)?$/);
    if (siteMatch) {
      const [, id, sub] = siteMatch;
      const site = store.getSite(id ?? '');
      if (!site || site.ownerKey !== apiKey.key) throw new MonitorError(404, 'site not found');

      if (req.method === 'DELETE' && !sub) {
        store.removeSite(apiKey.key, site.id);
        return json(res, 200, { deleted: site.id });
      }
      if (req.method === 'GET' && sub === '/runs') {
        return json(res, 200, { site: site.url, runs: store.runsForSite(site.id) });
      }
      if (req.method === 'GET' && sub === '/evidence') {
        res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' });
        res.end(renderEvidence(site, store.runsForSite(site.id)));
        return;
      }
    }

    throw new MonitorError(404, `no route: ${route}`);
  };

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      let body = '';
      try {
        body = await readBody(req);
        await handle({ req, res, url, body });
      } catch (err) {
        if (err instanceof MonitorError) return json(res, err.status, { error: err.message });
        if (err instanceof SyntaxError) return json(res, 400, { error: 'invalid JSON body' });
        log(`internal error: ${err instanceof Error ? err.message : String(err)}`);
        return json(res, 500, { error: 'internal error' });
      }
    })();
  });

  return { server, adminToken };
}
