import type { ComplianceAssessment } from './classify.js';

/**
 * Render a SARIF 2.1.0 log so findings appear in GitHub code scanning
 * (Security tab) and other SARIF-aware tooling.
 */
export function renderSarif(assessment: ComplianceAssessment): string {
  const rules = assessment.assessments.map((a) => ({
    id: a.obligation.article,
    name: a.obligation.title.replace(/\W+/g, ''),
    shortDescription: { text: `${a.obligation.article} — ${a.obligation.title}` },
    fullDescription: { text: a.obligation.summary },
    helpUri: 'https://artificialintelligenceact.eu/article/50/',
    properties: { deadline: a.obligation.deadline },
  }));

  const results = assessment.assessments
    .filter((a) => a.status === 'action-required')
    .flatMap((a) =>
      a.findings.map((f) => ({
        ruleId: a.obligation.article,
        level: 'warning' as const,
        message: {
          text: `${f.title}: ${f.hint} ${a.obligation.article} (${a.obligation.title}) applies from ${a.obligation.deadline} and no compliance evidence was found.`,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: f.file.split('\\').join('/') },
              region: { startLine: f.line },
            },
          },
        ],
      })),
    );

  const log = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'article50',
            informationUri: 'https://github.com/article50',
            version: '0.1.0',
            rules,
          },
        },
        results,
      },
    ],
  };
  return JSON.stringify(log, null, 2);
}
