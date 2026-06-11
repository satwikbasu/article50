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
| `POST /v1/sites` `{url, intervalSeconds?, webhook?}` | API key | register a site; interval is clamped to the plan minimum |
| `GET /v1/sites` | API key | list your sites with last run status |
| `DELETE /v1/sites/:id` | API key | stop monitoring |
| `GET /v1/sites/:id/runs` | API key | run history as JSON |
| `GET /v1/sites/:id/evidence` | API key | the evidence log as markdown, ready for an auditor |
| `POST /v1/billing/stripe` | Stripe signature | plan upgrades on checkout completion |
| `GET /healthz` | none | liveness |

Plan limits, enforced server-side:

| Plan | Sites | Minimum check interval |
| --- | --- | --- |
| free | 1 | 24 hours |
| site (€29/mo) | 1 | 1 hour |
| team (€99/mo) | 10 | 15 minutes |

When a check's failure set changes (new failing article, new error), Monitor POSTs `{"text": "..."}` to the site's webhook. That format works with Slack incoming webhooks as-is.

## Stripe setup

1. Create two Stripe Payment Links or Checkout sessions (site €29/mo, team €99/mo). On each, set metadata `a50_key` to the customer's API key and `a50_plan` to `site` or `team`. The cleanest flow: create the key first (`POST /v1/keys` with plan `free`), give it to the customer, and put it in the checkout metadata.
2. Add a webhook endpoint in Stripe pointing at `https://your-host/v1/billing/stripe`, subscribed to `checkout.session.completed`.
3. Set `STRIPE_WEBHOOK_SECRET` in the Monitor environment. Signatures are verified (HMAC-SHA256, 5-minute tolerance); unsigned events are rejected unless you explicitly set `A50_INSECURE_STRIPE=1` for local testing.

Downgrades and cancellations aren't automated yet; handle `customer.subscription.deleted` the same way (it's a `store.setPlan(key, 'free')` call) or do it manually. That's the first thing v0.4 should add.

## Operational notes

- One scheduler tick runs all due sites sequentially; ticks never overlap. For hundreds of sites, raise `--tick` granularity awareness: checks are due-time based, so nothing is lost, they just queue.
- Audit failures (timeouts, DNS) are recorded as ERROR runs in the evidence log and alert once, like any other regression.
- The audit reads raw HTML. A site that renders its chat widget purely client-side can pass incorrectly; see the limitations table in project-context.md.
- Restarting the process re-checks every site once on boot (the due-times reset). With an append-only log, an extra check is noise, not damage.
