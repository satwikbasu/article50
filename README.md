# article50

Scan your code and your live site for EU AI Act Article 50 transparency gaps, then generate the fixes. The first deadline is August 2, 2026.

```
npx article50 scan
```

## The problem

Article 50 of the EU AI Act is the part almost nobody is preparing for. The EU delayed the high-risk rules to 2027 and 2028, but the transparency rules stayed put, and they apply to nearly any product with an AI feature that reaches EU users. Not just AI labs. A SaaS app with a support chatbot counts.

| Obligation | What it requires | Applies from |
| --- | --- | --- |
| Art. 50(1) | Tell users when they're talking to an AI (chatbots, voice, agents) | 2026-08-02 |
| Art. 50(2) | Mark AI-generated content (text, images, audio, video) in a machine-readable format | 2026-12-02 |
| Art. 50(3) | Inform people exposed to emotion recognition or biometric categorisation | 2026-08-02 |
| Art. 50(4) | Visibly disclose deepfakes and AI-generated public-interest text | 2026-08-02 |

Fines go up to €15M or 3% of global annual turnover, whichever is higher (Art. 99(4)). An April 2026 survey found 78% of organizations hadn't taken meaningful steps yet. Most teams can't even list where AI shows up in their own product, which is the first thing a regulator will ask for.

## What article50 does

Four commands, in the order you'll actually need them:

**`a50 scan`** finds the AI in your codebase. It knows the fingerprints of 20+ AI SDKs and APIs (OpenAI, Anthropic, Gemini, LangChain, ElevenLabs, chat widgets, and so on) across JavaScript/TypeScript, Python, Go, Java, and dependency manifests. Each finding is mapped to its Article 50 obligation, with the file, the line, a confidence rating, and a countdown to the deadline.

**`a50 audit <url>`** checks what an inspector's crawler would see on your live site: disclosure language, ai-generated meta tags, IPTC `trainedAlgorithmicMedia`, C2PA markers, JSON-LD. Add `--crawl` to walk every same-origin page.

**`a50 generate`** writes the fixes: a "you are talking to an AI" notice in all 24 official EU languages (HTML or React), machine-readable marking snippets, and a starter transparency policy.

**`a50 mark image.png`** embeds the machine-readable AI label directly into PNG and JPEG files, as an IPTC `digitalSourceType: trainedAlgorithmicMedia` XMP packet. Pure Node, no native dependencies. `--check` verifies files that should already be marked.

## Quick start

```bash
# in any repo with an AI feature:
npx article50 scan

# audit your production site, every page:
npx article50 audit https://your-app.com --crawl

# generate the fixes:
npx article50 generate disclosure --lang de --react
npx article50 generate marking --model gpt-4o --provider openai
npx article50 generate policy --name "Acme" -o ai-transparency.md

# label AI-generated media files:
npx article50 mark hero-image.png --model gpt-image-1
```

Example scan output:

```
  article50 — EU AI Act Article 50 transparency scan
  ~/acme-support · 412 files scanned

  ✖ Art. 50(1) AI interaction disclosure  [ACTION REQUIRED]
    applies in 52 days (2026-08-02)
      → api/chat.ts:3   [OpenAI SDK · high]
      → src/chat.tsx:4  [Vercel AI SDK · high]

  ✖ Art. 50(2) Machine-readable marking of AI-generated content  [ACTION REQUIRED]
    applies in 174 days (2026-12-02)
      → scripts/voiceover.py:7  [Speech/audio generation API · medium]

  ✖ 2 obligations require action.
  Non-compliance: fines up to €15M or 3% of global annual turnover (Art. 99(4)).
```

## Keeping it that way

Compliance breaks silently. A redesign drops the disclosure banner, a new feature ships unlabeled output, and nobody notices until someone outside the company does. Two ways to catch it:

**In CI**, fail the build when an AI surface ships without coverage:

```yaml
- run: npx article50 scan --ci --min-confidence high
- run: npx article50 audit https://staging.your-app.com --ci
```

Findings can also feed GitHub's Security tab:

```yaml
- run: npx article50 scan --sarif a50.sarif
- uses: github/codeql-action/upload-sarif@v3
  with: { sarif_file: a50.sarif }
```

**In production**, re-audit on a loop and get pinged when something regresses:

```bash
a50 watch https://your-app.com --interval 3600 --webhook https://hooks.slack.com/...
```

`--once` makes it cron-friendly.

## Configuration

Built-in signatures can't know about your in-house LLM gateway. Declare it in `a50.config.json` at the repo root and the scanner treats it like any other AI surface:

```json
{
  "ignorePaths": ["legacy/", "third_party/"],
  "disableDetectors": ["emotion-api"],
  "customDetectors": [
    {
      "id": "inhouse-llm",
      "title": "Internal LLM gateway",
      "pattern": "llm-gateway\\.internal",
      "categories": ["interaction", "synthetic-content"],
      "confidence": "high"
    }
  ]
}
```

## Library API

Everything the CLI does is importable:

```ts
import { scan, classify, auditHtml, markHtml, markPng, disclosureHtml } from 'article50';

const assessment = classify(scan('./'));          // compliance state as data
const page = markHtml(html, { model: 'gpt-4o' });  // inject Art. 50(2) marking
const labeled = markPng(imageBuffer);              // XMP-marked PNG buffer
```

## Pricing

The CLI is free and MIT-licensed. Scan, audit, mark, and generate as much as you want, forever.

The paid product, article50 Monitor, is the hosted version of `watch`: daily audits of your production sites, alerts on regressions, an evidence log you can hand to auditors ("we were compliant on these dates"), and updates when the EU moves dates or publishes new guidance. €29/month for one site, €99/month for ten plus org-wide scan reports. You can self-host `watch` with cron instead; Monitor exists for teams that want the evidence trail without running infrastructure.

## What it detects

LLM and chat SDKs (OpenAI, Anthropic, Google Gemini, Mistral, Cohere, Vercel AI, LangChain, LlamaIndex, LiteLLM, Ollama, AWS Bedrock, Azure OpenAI, Hugging Face Transformers), raw provider APIs (api.openai.com, Groq, Together, OpenRouter and friends), generation APIs for images, voice, and video (DALL·E, Stability, Replicate, fal.ai, Flux, ElevenLabs, Play.ht, Runway, Luma, HeyGen, D-ID), emotion and biometric APIs (Hume, Rekognition emotion detection), chat UI widgets (Intercom, Drift, Crisp, Zendesk, Botpress, Voiceflow, CopilotKit, NLUX, custom components), and your own endpoints via `a50.config.json`. It also recognizes existing compliance work (disclosure markup, ai-generated meta tags, C2PA, IPTC digitalSourceType, SynthID) so already-compliant code shows up as "review" rather than a false alarm.

## Disclaimer

article50 is a technical aid, not legal advice. It finds signals and generates artifacts. Whether a given obligation applies to your product is a legal question; confirm with counsel.

## Development

```bash
npm install
npm run check   # lint + test + build
npm run dev -- scan test/fixtures/demo-app
```

## License

[MIT](LICENSE)
