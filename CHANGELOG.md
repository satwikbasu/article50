# Changelog

## 0.6.0 — 2026-06-12

Detection quality: the scanner now checks whether imports are actually used.

- SDK import findings get usage analysis: the imported binding names are extracted (JS/TS default, named, namespace, and require forms; Python `import` / `from … import` with aliases) and checked for references elsewhere in the file. An import that is never touched again is downgraded to low confidence with an explicit "imported but never used" hint, so dead code and stale imports stop failing `--min-confidence high` CI gates.
- Findings carry a `usage` field (`used` / `unused` / `unknown`) in JSON and SARIF output for SDK import matches. Other imports and comment lines don't count as usage; anything unparseable is left untouched — unknown beats wrong.
- Verified against vercel/ai-chatbot: all 46 SDK import findings correctly identified as used, zero false downgrades.
- 83 tests, up from 72.

## 0.5.0 — 2026-06-12

The release that closes the SPA blind spot.

- `a50 audit --render` and `a50 watch --render` audit the rendered DOM in a headless browser, catching chat widgets that mount via JavaScript and are invisible in raw HTML. Playwright is an optional peer dependency: install it (`npm install playwright && npx playwright install chromium`) only if you need rendered audits; everything else keeps working without it, and the error message tells you exactly what to install.
- Detection now recognizes mounted-widget DOM artifacts (Intercom launcher, Crisp chatbox, Drift frames, Tidio, Chatwoot) in addition to loader script tags — what a rendered audit actually sees after the widget boots.
- Monitor: register sites with `render: true` and the scheduler audits their rendered DOM. One shared browser launches lazily on first use; if Playwright isn't installed on the host, rendered checks record an actionable error in the evidence log rather than a false pass.
- `a50 watch --state <file>` persists the regression baseline, so restarts and `--once` cron runs no longer re-alert on already-reported failures.
- `auditUrl` and `auditSite` accept an injectable HTML fetcher (library API).
- 72 tests, up from 62. Verified end-to-end against a real SPA fixture: raw audit reports no signals, rendered audit catches the JS-mounted widget.

## 0.4.1 — 2026-06-12

- Fix: `a50 --version` reported 0.3.0 in the 0.4.0 release. The CLI now reads its version from package.json, and a test pins the two together so this can't recur.

## 0.4.0 — 2026-06-12

Billing lifecycle completed and a fairer audit.

- Stripe `customer.subscription.deleted` events now downgrade the key to the free plan automatically — cancellations no longer need a manual key edit. Add the event to your webhook subscription and copy the `a50_key` metadata onto the subscription (see MONITOR.md).
- Downgrades take effect immediately: the Monitor scheduler clamps every site's audit interval to the owner's *current* plan, so a cancelled team key drops from 15-minute to daily checks without touching the site records.
- `a50 audit` no longer fails pages that have no AI signals at all. A page with no chat surface, no machine-readable marker, and no AI disclosure language has no observable Article 50 marking obligation; it now passes with an explanatory `ai-content-signals` check. Pages that do show AI signals keep the strict checks — visible "AI-generated" text without a machine-readable marker still fails Art. 50(2). Caveat unchanged: the audit reads raw HTML, so a fully client-side-rendered custom widget needs the (planned) rendered-DOM audit to be caught.
- 61 tests, up from 57.

## 0.3.0 — 2026-06-11

The revenue engine. `a50 monitor` runs the Monitor server: scheduled audits of registered sites, Slack-compatible regression alerts, and an append-only evidence log served as auditor-ready markdown.

- HTTP API with Bearer-key auth: create keys (admin), register sites, list runs, export evidence. Customers can't see each other's sites.
- Plan limits enforced server-side: free (1 site, daily), site €29/mo (1 site, hourly), team €99/mo (10 sites, 15 min). Adding a site beyond the plan returns 402.
- Stripe webhook endpoint (`/v1/billing/stripe`) with real signature verification (HMAC-SHA256, timestamp tolerance) upgrades a key's plan on `checkout.session.completed`. Unsigned events are rejected unless explicitly allowed for local dev.
- State is a data directory: `keys.json`, `sites.json`, and append-only `runs.jsonl`. No database, no native dependencies. Survives restarts; see MONITOR.md for deployment.
- 57 tests, up from 40, including the full HTTP API exercised over a real socket.

## 0.2.0 — 2026-06-11

- New `a50 mark <files...>` command embeds machine-readable AI marking (IPTC `digitalSourceType: trainedAlgorithmicMedia` XMP) directly into PNG and JPEG files. Pure Node, no native dependencies. `--check` verifies existing marks, `--model` and `--provider` record provenance.
- New `a50.config.json` lets teams declare in-house AI endpoints as custom detectors, ignore paths, and disable built-in detectors. This closes the blind spot for internal LLM gateways the built-in signatures can't know about.
- Every finding now carries a confidence rating (high, medium, low). `a50 scan --min-confidence high` keeps CI gates quiet on keyword-grade signals.
- New `a50 audit --crawl` follows same-origin links and audits a whole site (10 pages by default, `--max-pages` to raise).
- New `a50 watch <url>` re-audits a live page on an interval. `--webhook` sends a Slack-compatible alert when compliance regresses, `--once` suits cron.
- Disclosure banner strings now cover all 24 official EU languages, up from 8. Machine-quality translations; have a native speaker review before launch.
- 40 tests, up from 27, including byte-level checks of marked PNG/JPEG structure.

## 0.1.0 — 2026-06-11

Initial release.

- `a50 scan`: codebase scanner with 20+ AI SDK/API/widget signatures across JS/TS, Python, Go, Java, and dependency manifests. Maps findings to Article 50(1)–(4) obligations with deadline countdowns (Digital Omnibus dates), detects existing compliance evidence. Supports `--json`, `--report <md>`, `--sarif <file>` for GitHub code scanning, and `--ci`.
- `a50 audit`: audits a live URL or HTML file for visible AI disclosure, machine-readable markers (ai-generated meta, IPTC trainedAlgorithmicMedia, C2PA, JSON-LD), and chat widgets missing disclosure. Supports `--json` and `--ci`.
- `a50 generate`: disclosure banners (HTML and React), machine-readable marking snippets (meta, JSON-LD, HTTP header), and an AI transparency policy template.
- Library API: `scan`, `classify`, `auditHtml`, `markHtml`, `disclosureHtml`, `policyMarkdown`, and friends.
- 25 tests, ESLint clean, GitHub Actions CI.
