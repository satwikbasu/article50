import { readFileSync } from 'node:fs';

export interface AuditCheck {
  id: string;
  title: string;
  article: string;
  passed: boolean;
  detail: string;
}

export interface AuditResult {
  target: string;
  /** True when an AI surface (chat widget) was detected on the page. */
  aiSurfaceDetected: boolean;
  checks: AuditCheck[];
  passed: boolean;
}

const CHAT_WIDGET_PATTERNS: Array<[string, RegExp]> = [
  ['Intercom', /intercom(cdn|settings|\.io)/i],
  ['Drift', /drift\.com|driftt\.com/i],
  ['Crisp', /crisp\.chat/i],
  ['Zendesk', /zdassets|zendesk/i],
  ['HubSpot chat', /usemessages\.com|hubspot.*conversations/i],
  ['Tidio', /tidio\.co/i],
  ['Botpress', /botpress/i],
  ['Voiceflow', /voiceflow/i],
  ['Custom chat UI', /(chat-widget|chatbot|chat-window|data-chat|id=["']chat)/i],
];

const MACHINE_READABLE_PATTERNS: Array<[string, RegExp]> = [
  ['meta ai-generated', /<meta[^>]+name=["']ai-(generated|disclosure)["']/i],
  ['IPTC digital source type', /trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia/i],
  ['C2PA / Content Credentials', /c2pa|content[-_ ]?credentials/i],
  ['JSON-LD AI declaration', /"(genAI|isAiGenerated|aiGenerated)"\s*:/i],
];

const VISIBLE_DISCLOSURE = /(you (are|'re) (chatting|talking|interacting) with (an )?(AI|artificial intelligence)|AI[- ]assistant|AI[- ]generated|generated (by|with) (an )?(AI|artificial intelligence)|powered by (an )?AI|virtual assistant)/i;

/**
 * Audit an HTML document for Article 50 transparency signals.
 * Heuristic by design: it tells you what a regulator's crawler (or a
 * journalist's view-source) would and would not find.
 */
export function auditHtml(html: string, target = 'document'): AuditResult {
  const checks: AuditCheck[] = [];

  const widgets = CHAT_WIDGET_PATTERNS.filter(([, re]) => re.test(html)).map(([name]) => name);
  const aiSurfaceDetected = widgets.length > 0;

  const machineReadable = MACHINE_READABLE_PATTERNS.filter(([, re]) => re.test(html)).map(([name]) => name);
  const hasVisible = VISIBLE_DISCLOSURE.test(html);

  if (aiSurfaceDetected) {
    checks.push({
      id: 'interaction-disclosure',
      title: 'Visible AI interaction disclosure near detected chat surface',
      article: 'Art. 50(1)',
      passed: hasVisible,
      detail: hasVisible
        ? `Disclosure language found alongside detected surface(s): ${widgets.join(', ')}`
        : `Chat surface detected (${widgets.join(', ')}) but no AI disclosure language found in the page.`,
    });
  }

  checks.push({
    id: 'machine-readable-marking',
    title: 'Machine-readable AI-content marking present',
    article: 'Art. 50(2)',
    passed: machineReadable.length > 0,
    detail:
      machineReadable.length > 0
        ? `Found: ${machineReadable.join(', ')}`
        : 'No machine-readable AI markers found (no ai-generated meta tag, IPTC digitalSourceType, C2PA, or JSON-LD declaration).',
  });

  checks.push({
    id: 'visible-disclosure',
    title: 'Human-visible AI disclosure language present',
    article: 'Art. 50(1)/(4)',
    passed: hasVisible,
    detail: hasVisible
      ? 'Visible AI disclosure language found.'
      : 'No visible AI disclosure language found anywhere in the document.',
  });

  return {
    target,
    aiSurfaceDetected,
    checks,
    passed: checks.every((c) => c.passed),
  };
}

export function auditFile(path: string): AuditResult {
  return auditHtml(readFileSync(path, 'utf8'), path);
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'article50-audit/0.2 (+https://github.com/satwikbasu/article50)' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Fetch failed for ${url}: HTTP ${res.status}`);
  }
  return res.text();
}

export async function auditUrl(url: string): Promise<AuditResult> {
  return auditHtml(await fetchHtml(url), url);
}

/** Same-origin links worth crawling (no assets, anchors, or mailto). */
export function extractLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const out = new Set<string>();
  for (const match of html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["']/gi)) {
    const href = match[1];
    if (!href || /^(mailto:|tel:|javascript:)/i.test(href)) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.origin !== base.origin) continue;
    if (/\.(png|jpe?g|gif|svg|webp|css|js|ico|pdf|zip|mp4|webm|woff2?)$/i.test(url.pathname)) continue;
    url.hash = '';
    out.add(url.toString());
  }
  return [...out];
}

export interface SiteAuditResult {
  start: string;
  pages: AuditResult[];
  errors: Array<{ url: string; error: string }>;
  passed: boolean;
}

/** Breadth-first audit of same-origin pages, starting from `startUrl`. */
export async function auditSite(startUrl: string, maxPages = 10): Promise<SiteAuditResult> {
  const queue: string[] = [startUrl];
  const seen = new Set<string>([startUrl]);
  const pages: AuditResult[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  while (queue.length > 0 && pages.length + errors.length < maxPages) {
    const url = queue.shift() as string;
    let html: string;
    try {
      html = await fetchHtml(url);
    } catch (err) {
      errors.push({ url, error: err instanceof Error ? err.message : String(err) });
      continue;
    }
    pages.push(auditHtml(html, url));
    for (const link of extractLinks(html, url)) {
      if (!seen.has(link)) {
        seen.add(link);
        queue.push(link);
      }
    }
  }

  return { start: startUrl, pages, errors, passed: pages.length > 0 && pages.every((p) => p.passed) };
}
