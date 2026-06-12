# Deploying article50 Monitor

Monitor is a single Node process with no external dependencies. State lives in a data directory: `keys.json`, `sites.json`, and `runs.jsonl`. The runs file is append-only on purpose; it's the evidence log, and evidence you can quietly rewrite isn't evidence.

## Run it

```bash
npm install -g article50         # or use npx
A50_ADMIN_TOKEN=$(openssl rand -hex 24) a50 monitor --port 8400 --data /var/lib/a50
```

Flags: `--port` (default 8400), `--data` (default ./a50-monitor-data), `--tick` (scheduler granularity in seconds, default 15), `--admin-token` (or the `A50_ADMIN_TOKEN` env var; a token is generated and printed if you set neither).

Put it behind any TLS-terminating reverse proxy (Caddy, nginx, a PaaS like Fly or Railway). The process is stateless apart from the data directory, so back that up and you've backed up everything.

## API

| Route | Auth | What it does |
| --- | --- | --- |
| `POST /v1/keys` `{plan, label?}` | admin token | create a customer API key |
| `POST /v1/keys/rotate` | API key | replace your key's secret; plan, label, and sites carry over, the old secret dies immediately |
| `POST /v1/sites` `{url, intervalSeconds?, webhook?, render?}` | API key | register a site; interval is clamped to the plan minimum; `render: true` audits the rendered DOM |
| `GET /v1/sites` | API key | list your sites with last run status |
| `DELETE /v1/sites/:id` | API key | stop monitoring |
| `GET /v1/sites/:id/runs` | API key | run history as JSON |
| `GET /v1/sites/:id/evidence` | API key | the evidence log as markdown, ready for an auditor, with hash-chain integrity verification |
| `POST /v1/billing/stripe` | Stripe signature | plan upgrades on checkout completion, downgrade to free on subscription deletion |
| `GET /healthz` | none | liveness |

Plan limits, enforced server-side:

| Plan | Sites | Minimum check interval |
| --- | --- | --- |
| free | 1 | 24 hours |
| site (€29/mo) | 1 | 1 hour |
| team (€99/mo) | 10 | 15 minutes |

When a check's failure set changes (new failing article, new error), Monitor POSTs `{"text": "..."}` to the site's webhook. That format works with Slack incoming webhooks as-is.

## Evidence integrity

Every recorded check is hash-chained: each entry's SHA-256 covers its content plus the previous entry's hash. Editing any past result breaks every later hash, and the evidence export verifies the whole chain on each request — a clean log says so, a broken one is flagged loudly with the first bad entry. Logs from before this feature verify from their first hashed entry onward.

## Rate limiting

Every route except `/healthz` is rate-limited per API key (or per client IP when unauthenticated): 60-request burst, then 1 request/second sustained, HTTP 429 beyond that. Tune or disable via `createMonitorServer({ rateLimit })` if you embed the server.

## Stripe setup

1. Create two Stripe Payment Links or Checkout sessions (site €29/mo, team €99/mo). On each, set metadata `a50_key` to the customer's API key and `a50_plan` to `site` or `team`. The cleanest flow: create the key first (`POST /v1/keys` with plan `free`), give it to the customer, and put it in the checkout metadata. For subscriptions, also copy the same metadata onto the subscription (`subscription_data.metadata` on the Payment Link or Checkout session) so cancellation events carry the key too.
2. Add a webhook endpoint in Stripe pointing at `https://your-host/v1/billing/stripe`, subscribed to `checkout.session.completed` and `customer.subscription.deleted`.
3. Set `STRIPE_WEBHOOK_SECRET` in the Monitor environment. Signatures are verified (HMAC-SHA256, 5-minute tolerance); unsigned events are rejected unless you explicitly set `A50_INSECURE_STRIPE=1` for local testing.

Checkout completion upgrades the key to the plan in the metadata; subscription deletion downgrades it to `free`. The downgrade takes effect immediately — existing sites stay registered, but the scheduler clamps their audit interval to the free plan's daily minimum, and adding sites beyond the free limit returns 402.

## Operational notes

- One scheduler tick runs all due sites sequentially; ticks never overlap. For hundreds of sites, raise `--tick` granularity awareness: checks are due-time based, so nothing is lost, they just queue.
- Audit failures (timeouts, DNS) are recorded as ERROR runs in the evidence log and alert once, like any other regression.
- By default the audit reads raw HTML, which misses widgets that mount via JavaScript. Register such sites with `render: true` and install Playwright on the Monitor host (`npm install playwright && npx playwright install chromium --with-deps`). The browser launches lazily on the first rendered check and is shared across sites; without Playwright installed, rendered checks record an actionable error in the evidence log instead of a false pass.
- Restarting the process re-checks every site once on boot (the due-times reset). With an append-only log, an extra check is noise, not damage.
