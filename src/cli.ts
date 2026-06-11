#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { scan } from './scanner.js';
import { classify } from './classify.js';
import { renderJson, renderMarkdown, renderTerminal } from './report.js';
import { auditFile, auditUrl, type AuditResult } from './audit.js';
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
  .version('0.1.0');

program
  .command('scan')
  .argument('[dir]', 'directory to scan', '.')
  .description('Scan a codebase for AI surfaces that trigger Article 50 obligations')
  .option('--json', 'output JSON instead of the terminal report')
  .option('--report <file>', 'also write a markdown report to <file>')
  .option('--ci', 'exit with code 1 when action is required (for CI gates)')
  .action((dir: string, opts: { json?: boolean; report?: string; ci?: boolean }) => {
    const root = resolve(dir);
    const assessment = classify(scan(root));

    if (opts.json) {
      console.log(renderJson(assessment));
    } else {
      console.log(renderTerminal(assessment));
    }
    if (opts.report) {
      writeFileSync(opts.report, renderMarkdown(assessment));
      console.error(pc.dim(`Markdown report written to ${opts.report}`));
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
  .option('--ci', 'exit with code 1 when checks fail')
  .action(async (target: string, opts: { json?: boolean; ci?: boolean }) => {
    let result: AuditResult;
    try {
      result = /^https?:\/\//i.test(target) ? await auditUrl(target) : auditFile(target);
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
