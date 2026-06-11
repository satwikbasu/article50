# article50

**The EU AI Act Article 50 transparency compliance toolkit. Scan your code, audit your site, generate the fix — before August 2, 2026.**

```
npx article50 scan
```

## The problem

On **August 2, 2026**, Article 50 of the EU AI Act applies. Unlike the high-risk rules (delayed to 2027–2028 by the Digital Omnibus), the transparency obligations were **not** meaningfully delayed — and they apply to nearly **every product with an AI feature** that touches EU users, not just "high-risk" systems:

| Obligation | What it requires | Applies from |
| --- | --- | --- |
| **Art. 50(1)** | Tell users they're interacting with an AI system (chatbots, voice, agents) | **2026-08-02** |
| **Art. 50(2)** | Mark AI-generated content (text, images, audio, video) in a **machine-readable** format | **2026-12-02** |
| **Art. 50(3)** | Inform people exposed to emotion recognition / biometric categorisation | **2026-08-02** |
| **Art. 50(4)** | Visibly disclose deepfakes and AI-generated public-interest text | **2026-08-02** |

Penalties: up to **€15M or 3% of global annual turnover** (Art. 99(4)). As of April 2026, 78% of organizations hadn't taken meaningful steps.

## The solution

`article50` closes the loop in three commands:

1. **`a50 scan`** — finds every AI surface in your codebase (20+ SDK and API signatures across JS/TS, Python, Go, Java, and dependency manifests), maps each one to its Article 50 obligation, and tells you exactly what's missing — with a deadline countdown.
2. **`a50 audit <url>`** — checks what a regulator's crawler would see on your **live site**: disclosure language, `ai-generated` meta tags, IPTC `trainedAlgorithmicMedia`, C2PA / Content Credentials, JSON-LD declarations.
3. **`a50 generate`** — emits the fix: localized disclosure banners (8 EU languages, HTML or React), machine-readable marking snippets, and an AI transparency policy document.

## Quick start (60 seconds)

```bash
# in any repo with an AI feature:
npx article50 scan

# audit your production site:
npx article50 audit https://your-app.com

# generate the fixes:
npx article50 generate disclosure --lang de --react
npx article50 generate marking --model gpt-4o --provider openai
npx article50 generate policy --name "Acme" -o ai-transparency.md
```

Example scan output:

```
  article50 — EU AI Act Article 50 transparency scan
  ~/acme-support · 412 files scanned

  ✖ Art. 50(1) AI interaction disclosure  [ACTION REQUIRED]
    applies in 52 days (2026-08-02)
      → api/chat.ts:3   [OpenAI SDK]
      → src/chat.tsx:4  [Vercel AI SDK]

  ✖ Art. 50(2) Machine-readable marking of AI-generated content  [ACTION REQUIRED]
    applies in 174 days (2026-12-02)
      → scripts/voiceover.py:7  [Speech/audio generation API]

  ✖ 2 obligations require action.
  Non-compliance: fines up to €15M or 3% of global annual turnover (Art. 99(4)).
```

## CI gate

Fail the build when an AI surface ships without transparency coverage:

```yaml
- run: npx article50 scan --ci          # exit 1 on action-required
- run: npx article50 audit https://staging.your-app.com --ci
```

Machine-readable output for your own tooling: `a50 scan --json`, `a50 scan --report compliance.md`.

## Library API

```ts
import { scan, classify, auditHtml, markHtml, disclosureHtml } from 'article50';

const assessment = classify(scan('./'));         // programmatic compliance state
const page = markHtml(html, { model: 'gpt-4o' }); // inject Art. 50(2) marking
```

## What it detects

- **LLM / chat SDKs:** OpenAI, Anthropic, Google Gemini, Mistral, Cohere, Vercel AI, LangChain, LlamaIndex, LiteLLM, Ollama, AWS Bedrock, Azure OpenAI, Hugging Face Transformers
- **Raw provider APIs:** api.openai.com, api.anthropic.com, Groq, Together, OpenRouter, …
- **Generation APIs:** DALL·E / gpt-image, Stability, Replicate, fal.ai, Flux, ElevenLabs, Play.ht, Runway, Luma, HeyGen, D-ID, …
- **Emotion / biometric APIs:** Hume, Rekognition emotion detection, …
- **Chat UI widgets:** Intercom, Drift, Crisp, Zendesk, Botpress, Voiceflow, CopilotKit, NLUX, custom chat components
- **Existing compliance evidence:** disclosure markup, ai-generated meta tags, C2PA/Content Credentials, IPTC digitalSourceType, SynthID

## Pricing

The CLI is **free and MIT-licensed** — scan, audit, and generate as much as you want.

**article50 Monitor** (hosted, coming with v0.2) keeps you compliant *after* the first fix, because every deploy can silently remove a disclosure banner:

| Plan | Price | Includes |
| --- | --- | --- |
| **Site** | €29/mo | Daily audits of 1 production site, Slack/email alerts on regressions, evidence log for auditors |
| **Team** | €99/mo | 10 sites, org-wide GitHub scan reports, regulation-update feed (guidance is still evolving through 2027) |

## Disclaimer

article50 is a technical aid, not legal advice. It detects signals and generates artifacts; whether an obligation applies to your product is a legal question — confirm with qualified counsel.

## Development

```bash
npm install
npm run check   # lint + test + build
npm run dev -- scan test/fixtures/demo-app
```

## License

[MIT](LICENSE)
