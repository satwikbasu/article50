#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { scan } from './scanner.js';
import { classify } from './classify.js';
import { renderJson, renderMarkdown, renderTerminal } from './report.js';
import { renderSarif } from './sarif.js';
import { auditFile, auditSite, auditUrl, type AuditResult } from './audit.js';
import { checkFile, markFile } from './mark.js';
import type { Confidence } from './rules/detectors.js';
import {
  DISCLOSURE_STRINGS,
  disclosureHtml,
  disclosureReact,
  markingHtml,
  policyMarkdown,
  MARKING_HTTP_HEADER,
} from './generate.js';

const program = new Command();

program
  .name('a50')
  .description('EU AI Act Article 50 transparency compliance toolkit')
  .version('0.2.0');

function parseConfidence(value: string): Confidence {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  throw new Error(`--min-confidence must be high, medium, or low (got "${value}")`);
}

program
  .command('scan')
  .argument('[dir]', 'directory to scan', '.')
  .description('Scan a codebase for AI surfaces that trigger Article 50 obligations')
  .option('--json', 'output JSON instead of the terminal report')
  .option('--report <file>', 'also write a markdown report to <file>')
  .option('--sarif <file>', 'also write a SARIF 2.1.0 log to <file> (GitHub code scanning)')
  .option('--min-confidence <level>', 'drop findings below this confidence: high | medium | low')
  .option('--ci', 'exit with code 1 when action is required (for CI gates)')
  .action((dir: string, opts: { json?: boolean; report?: string; sarif?: string; minConfidence?: string; ci?: boolean }) => {
    const root = resolve(dir);
    const assessment = classify(
      scan(root, { minConfidence: opts.minConfidence ? parseConfidence(opts.minConfidence) : undefined }),
    );

    if (opts.json) {
      console.log(renderJson(assessment));
    } else {
      console.log(renderTerminal(assessment));
    }
    if (opts.report) {
      writeFileSync(opts.report, renderMarkdown(assessment));
      console.error(pc.dim(`Markdown report written to ${opts.report}`));
    }
    if (opts.sarif) {
      writeFileSync(opts.sarif, renderSarif(assessment));
      console.error(pc.dim(`SARIF log written to ${opts.sarif}`));
    }
    if (opts.ci && assessment.actionRequired) {
      process.exitCode = 1;
    }
  });

program
  .command('audit')
  .argument('<target>', 'URL or local HTML file to audit')
  .description('Audit a live page or HTML file for Article 50 transparency markers')
  .option('--json', 'output JSON')
  .option('--crawl', 'follow same-origin links and audit every page found')
  .option('--max-pages <n>', 'page limit when crawling', '10')
  .option('--ci', 'exit with code 1 when checks fail')
  .action(async (target: string, opts: { json?: boolean; crawl?: boolean; maxPages: string; ci?: boolean }) => {
    const isUrl = /^https?:\/\//i.test(target);

    if (opts.crawl) {
      if (!isUrl) {
        console.error(pc.red('--crawl requires a URL target'));
        process.exitCode = 2;
        return;
      }
      const site = await auditSite(target, Number(opts.maxPages) || 10);
      if (opts.json) {
        console.log(JSON.stringify(site, null, 2));
      } else {
        console.log();
        console.log(pc.bold(pc.cyan('  article50')) + pc.dim(` — site crawl from ${site.start} (${site.pages.length} pages)`));
        console.log();
        for (const page of site.pages) {
          const failed = page.checks.filter((c) => !c.passed);
          const mark = page.passed ? pc.green('✓') : pc.red('✖');
          console.log(`  ${mark} ${page.target}${failed.length ? pc.dim(` — ${failed.map((c) => c.article).join(', ')} failing`) : ''}`);
        }
        for (const e of site.errors) console.log(`  ${pc.yellow('!')} ${e.url} ${pc.dim(`— ${e.error}`)}`);
        console.log();
        console.log(site.passed ? pc.green(pc.bold('  ✓ Every crawled page passed.')) : pc.red(pc.bold('  ✖ Transparency gaps found.')));
        console.log();
      }
      if (opts.ci && !site.passed) process.exitCode = 1;
      return;
    }

    let result: AuditResult;
    try {
      result = isUrl ? await auditUrl(target) : auditFile(target);
    } catch (err) {
      console.error(pc.red(`Audit failed: ${err instanceof Error ? err.message : String(err)}`));
      process.exitCode = 2;
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log();
      console.log(pc.bold(pc.cyan('  article50')) + pc.dim(` — transparency audit of ${result.target}`));
      console.log();
      for (const check of result.checks) {
        const mark = check.passed ? pc.green('✓') : pc.red('✖');
        console.log(`  ${mark} ${pc.bold(check.title)} ${pc.dim(`(${check.article})`)}`);
        console.log(pc.dim(`    ${check.detail}`));
      }
      console.log();
      console.log(
        result.passed
          ? pc.green(pc.bold('  ✓ All transparency checks passed.'))
          : pc.red(pc.bold('  ✖ Transparency gaps found — run `a50 generate` for drop-in fixes.')),
      );
      console.log();
    }
    if (opts.ci && !result.passed) process.exitCode = 1;
  });

program
  .command('mark')
  .argument('<files...>', 'PNG/JPEG files to mark as AI-generated')
  .description('Embed machine-readable AI marking (IPTC trainedAlgorithmicMedia XMP) into media files')
  .option('--model <name>', 'model name to embed')
  .option('--provider <name>', 'provider name to embed')
  .option('--check', 'only check whether files already carry the marking')
  .option('-o, --out <file>', 'write to <file> instead of in place (single input only)')
  .action((files: string[], opts: { model?: string; provider?: string; check?: boolean; out?: string }) => {
    if (opts.out && files.length > 1) {
      console.error(pc.red('--out works with a single input file'));
      process.exitCode = 2;
      return;
    }
    let failures = 0;
    for (const file of files) {
      try {
        if (opts.check) {
          const marked = checkFile(file);
          if (!marked) failures++;
          console.log(`  ${marked ? pc.green('✓ marked') : pc.red('✖ unmarked')}  ${file}`);
        } else {
          const result = markFile(file, { model: opts.model, provider: opts.provider }, opts.out);
          console.log(
            result.alreadyMarked
              ? `  ${pc.yellow('◐ already marked')}  ${file}`
              : `  ${pc.green('✓ marked')}  ${result.file}`,
          );
        }
      } catch (err) {
        failures++;
        console.error(`  ${pc.red('✖')} ${file} — ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (failures > 0) process.exitCode = 1;
  });

program
  .command('watch')
  .argument('<url>', 'URL to re-audit on an interval')
  .description('Continuously audit a live page and alert on compliance regressions')
  .option('--interval <seconds>', 'seconds between audits', '3600')
  .option('--webhook <url>', 'POST a Slack-compatible JSON alert on regression')
  .option('--once', 'run a single iteration (useful for cron)')
  .action(async (url: string, opts: { interval: string; webhook?: string; once?: boolean }) => {
    const intervalMs = Math.max(30, Number(opts.interval) || 3600) * 1000;
    let lastFailing: string | undefined;

    const iteration = async () => {
      const stamp = new Date().toISOString();
      let failing: string;
      try {
        const result = await auditUrl(url);
        failing = result.checks.filter((c) => !c.passed).map((c) => c.article).sort().join(', ');
        console.log(
          `[${stamp}] ${result.passed ? pc.green('PASS') : pc.red('FAIL')} ${url}${failing ? pc.dim(` (${failing})`) : ''}`,
        );
      } catch (err) {
        failing = `audit error: ${err instanceof Error ? err.message : String(err)}`;
        console.log(`[${stamp}] ${pc.yellow('ERROR')} ${url} — ${failing}`);
      }
      if (failing && failing !== lastFailing && opts.webhook) {
        const text = `article50: transparency regression on ${url} — ${failing} (EU AI Act Article 50)`;
        try {
          await fetch(opts.webhook, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text }),
            signal: AbortSignal.timeout(10_000),
          });
          console.log(pc.dim(`         webhook alert sent`));
        } catch (err) {
          console.error(pc.yellow(`         webhook failed: ${err instanceof Error ? err.message : String(err)}`));
        }
      }
      lastFailing = failing;
    };

    await iteration();
    if (opts.once) return;
    setInterval(() => void iteration(), intervalMs);
    console.log(pc.dim(`watching ${url} every ${intervalMs / 1000}s — Ctrl+C to stop`));
  });

program
  .command('generate')
  .argument('<artifact>', 'one of: disclosure | marking | policy')
  .description('Generate drop-in compliance artifacts')
  .option('--lang <code>', `disclosure language (${Object.keys(DISCLOSURE_STRINGS).join(', ')})`, 'en')
  .option('--react', 'emit a React component instead of plain HTML (disclosure only)')
  .option('--model <name>', 'model name to embed in marking metadata')
  .option('--provider <name>', 'provider name to embed in marking metadata')
  .option('--name <product>', 'product name (policy only)', 'Our product')
  .option('-o, --out <file>', 'write to file instead of stdout')
  .action(
    (
      artifact: string,
      opts: { lang: string; react?: boolean; model?: string; provider?: string; name: string; out?: string },
    ) => {
      let output: string;
      switch (artifact) {
        case 'disclosure':
          output = opts.react ? disclosureReact(opts.lang) : disclosureHtml(opts.lang);
          break;
        case 'marking':
          output = `${markingHtml({ model: opts.model, provider: opts.provider })}\n\n<!-- For API responses, also send:\n${MARKING_HTTP_HEADER} -->`;
          break;
        case 'policy':
          output = policyMarkdown(opts.name);
          break;
        default:
          console.error(pc.red(`Unknown artifact "${artifact}". Use: disclosure | marking | policy`));
          process.exitCode = 2;
          return;
      }
      if (opts.out) {
        writeFileSync(opts.out, output);
        console.error(pc.dim(`Written to ${opts.out}`));
      } else {
        console.log(output);
      }
    },
  );

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(pc.red(err instanceof Error ? err.message : String(err)));
  process.exitCode = 2;
});
