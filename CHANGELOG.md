# Changelog

## 0.1.0 — 2026-06-11

Initial release.

- `a50 scan` — codebase scanner: 20+ AI SDK/API/widget signatures across JS/TS, Python, Go, Java, and dependency manifests; maps findings to Article 50(1)–(4) obligations with deadline countdowns (Digital Omnibus dates); detects existing compliance evidence; `--json`, `--report <md>`, `--sarif <file>` (GitHub code scanning), `--ci`.
- `a50 audit` — live URL / HTML file audit for visible AI disclosure, machine-readable markers (ai-generated meta, IPTC trainedAlgorithmicMedia, C2PA, JSON-LD), and chat-widget disclosure gaps; `--json`, `--ci`.
- `a50 generate` — disclosure banners in 8 EU languages (HTML + React), machine-readable marking snippets (meta + JSON-LD + HTTP header), AI transparency policy template.
- Library API: `scan`, `classify`, `auditHtml`, `markHtml`, `disclosureHtml`, `policyMarkdown`, and friends.
- 25 tests, ESLint clean, GitHub Actions CI.
