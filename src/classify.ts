import { OBLIGATIONS, type Art50Category, type Obligation, daysUntil } from './deadlines.js';
import type { Evidence, Finding, ScanResult } from './scanner.js';

export type ObligationStatus = 'action-required' | 'review-evidence' | 'not-applicable';

export interface ObligationAssessment {
  obligation: Obligation;
  status: ObligationStatus;
  daysRemaining: number;
  findings: Finding[];
  evidence: Evidence[];
}

export interface ComplianceAssessment {
  root: string;
  filesScanned: number;
  generatedAt: string;
  assessments: ObligationAssessment[];
  /** Overall: true when at least one obligation requires action. */
  actionRequired: boolean;
}

export function classify(result: ScanResult, now: Date = new Date()): ComplianceAssessment {
  const assessments: ObligationAssessment[] = [];

  for (const obligation of Object.values(OBLIGATIONS)) {
    const cat: Art50Category = obligation.category;
    const findings = result.findings.filter((f) => f.categories.includes(cat));
    const evidence = result.evidence.filter((e) => e.categories.includes(cat));

    let status: ObligationStatus;
    if (findings.length === 0) {
      status = 'not-applicable';
    } else if (evidence.length > 0) {
      status = 'review-evidence';
    } else {
      status = 'action-required';
    }

    assessments.push({
      obligation,
      status,
      daysRemaining: daysUntil(obligation.deadline, now),
      findings,
      evidence,
    });
  }

  return {
    root: result.root,
    filesScanned: result.filesScanned,
    generatedAt: now.toISOString(),
    assessments,
    actionRequired: assessments.some((a) => a.status === 'action-required'),
  };
}
