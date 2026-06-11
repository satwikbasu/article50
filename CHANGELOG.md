# Changelog

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
