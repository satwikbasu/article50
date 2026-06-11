import pc from 'picocolors';
import { PENALTY_NOTE, deadlineLabel } from './deadlines.js';
import type { ComplianceAssessment, ObligationStatus } from './classify.js';

const DISCLAIMER =
  'article50 is a technical aid, not legal advice. Confirm findings with qualified counsel.';

const STATUS_META: Record<ObligationStatus, { label: string; symbol: string }> = {
  'action-required': { label: 'ACTION REQUIRED', symbol: '✖' },
  'review-evidence': { label: 'EVIDENCE FOUND — REVIEW', symbol: '◐' },
  'not-applicable': { label: 'NOT DETECTED', symbol: '✓' },
};

function statusColor(status: ObligationStatus, text: string): string {
  if (status === 'action-required') return pc.red(text);
  if (status === 'review-evidence') return pc.yellow(text);
  return pc.green(text);
}

function maxFindingsShown(total: number): number {
  return total > 8 ? 6 : total;
}

export function renderTerminal(assessment: ComplianceAssessment, now: Date = new Date()): string {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);

  push();
  push(pc.bold(pc.cyan('  article50')) + pc.dim(' — EU AI Act Article 50 transparency scan'));
  push(pc.dim(`  ${assessment.root} · ${assessment.filesScanned} files scanned`));
  push();

  for (const item of assessment.assessments) {
    const { obligation, status, findings, evidence } = item;
    const meta = STATUS_META[status];
    push(
      `  ${statusColor(status, meta.symbol)} ${pc.bold(`${obligation.article} ${obligation.title}`)}  ${statusColor(status, `[${meta.label}]`)}`,
    );
    push(pc.dim(`    ${deadlineLabel(obligation.deadline, now)} · ${obligation.appliesTo}`));

    if (findings.length > 0) {
      const shown = maxFindingsShown(findings.length);
      for (const f of findings.slice(0, shown)) {
        push(`      ${pc.dim('→')} ${f.file}:${f.line}  ${pc.dim(`[${f.title}]`)}`);
      }
      if (findings.length > shown) push(pc.dim(`      … and ${findings.length - shown} more`));
    }
    if (evidence.length > 0) {
      push(pc.dim(`      existing compliance signals: ${evidence.length} (e.g. ${evidence[0]?.file}:${evidence[0]?.line})`));
    }
    push();
  }

  const actionCount = assessment.assessments.filter((a) => a.status === 'action-required').length;
  if (assessment.actionRequired) {
    push(pc.red(pc.bold(`  ✖ ${actionCount} obligation${actionCount === 1 ? '' : 's'} require action.`)));
    push(pc.dim(`  ${PENALTY_NOTE}`));
    push();
    push(`  Next steps:`);
    push(`    ${pc.cyan('a50 generate disclosure')}  — drop-in "you are talking to an AI" banner (Art. 50(1))`);
    push(`    ${pc.cyan('a50 generate marking')}     — machine-readable AI-content marking (Art. 50(2))`);
    push(`    ${pc.cyan('a50 generate policy')}      — AI transparency policy document`);
    push(`    ${pc.cyan('a50 audit <url>')}          — verify your live site carries the markers`);
  } else {
    push(pc.green(pc.bold('  ✓ No unaddressed Article 50 obligations detected.')));
  }
  push();
  push(pc.dim(`  ${DISCLAIMER}`));
  push();
  return lines.join('\n');
}

export function renderMarkdown(assessment: ComplianceAssessment, now: Date = new Date()): string {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);

  push('# EU AI Act Article 50 Compliance Report');
  push();
  push(`- **Scanned:** \`${assessment.root}\` (${assessment.filesScanned} files)`);
  push(`- **Generated:** ${assessment.generatedAt} by [article50](https://github.com/article50)`);
  push(`- **Overall:** ${assessment.actionRequired ? '🔴 Action required' : '🟢 No unaddressed obligations detected'}`);
  push();

  for (const item of assessment.assessments) {
    const { obligation, status, findings, evidence } = item;
    const meta = STATUS_META[status];
    push(`## ${obligation.article} — ${obligation.title}`);
    push();
    push(`**Status:** ${meta.label}  ·  **Deadline:** ${deadlineLabel(obligation.deadline, now)}`);
    push();
    push(`> ${obligation.summary}`);
    push();
    if (findings.length > 0) {
      push('| File | Line | Signal | Note |');
      push('| --- | --- | --- | --- |');
      for (const f of findings) {
        push(`| \`${f.file}\` | ${f.line} | ${f.title} | ${f.hint} |`);
      }
      push();
    }
    if (evidence.length > 0) {
      push(`**Existing compliance signals (${evidence.length}):**`);
      push();
      for (const e of evidence.slice(0, 10)) {
        push(`- \`${e.file}:${e.line}\` — ${e.title}`);
      }
      push();
    }
  }

  push('---');
  push();
  push(`*${PENALTY_NOTE}*`);
  push();
  push(`*${DISCLAIMER}*`);
  push();
  return lines.join('\n');
}

export function renderJson(assessment: ComplianceAssessment): string {
  return JSON.stringify(assessment, null, 2);
}
