import { listDesignTasteBenchmarkReferences } from './benchmarks';
import { DESIGN_TASTE_JURY_RUBRIC } from './rubric';
import type {
  DesignTasteIssueFiling,
  DesignTasteJuryConsensus,
  DesignTasteJuryCriterion,
} from './types';

function buildIssueBody(params: {
  readonly findingSummary: string;
  readonly criteria: readonly DesignTasteJuryCriterion[];
  readonly surfaceId: string;
  readonly disposition: 'ship' | 'taste';
  readonly referenceComps: ReturnType<
    typeof listDesignTasteBenchmarkReferences
  >;
}): string {
  const compLines =
    params.referenceComps.length > 0
      ? params.referenceComps
          .map(comp => `- ${comp.label}: ${comp.url} — ${comp.rationale}`)
          .join('\n')
      : '- No benchmark references configured for this surface.';

  return [
    '## Source',
    '- Design taste jury loop (issue #10939)',
    `- Surface: ${params.surfaceId}`,
    '',
    '## Finding',
    params.findingSummary,
    '',
    ...(params.criteria.length > 0
      ? [
          '## Rubric criteria',
          ...params.criteria.map(
            criterion =>
              `- ${DESIGN_TASTE_JURY_RUBRIC[criterion].name} (${criterion})`
          ),
          '',
        ]
      : []),
    '## Classification',
    params.disposition === 'ship' ? 'Objective / ship' : 'Taste / Tim queue',
    '',
    '## Reference comps',
    compLines,
    '',
    '## Acceptance criteria',
    params.disposition === 'ship'
      ? 'Fix the objective visual defect and attach before/after screenshots with pixel-diff evidence.'
      : 'Tim reviews the taste direction and records accept/reject in design taste memory.',
  ].join('\n');
}

export function buildIssueFilingsFromConsensus(
  consensus: DesignTasteJuryConsensus
): readonly DesignTasteIssueFiling[] {
  const referenceComps = listDesignTasteBenchmarkReferences(
    consensus.surfaceId
  );

  return consensus.findings.map(finding => {
    const criteria = finding.criteria ?? [];
    const disposition = finding.objective ? 'ship' : finding.disposition;
    const queue = disposition === 'ship' ? 'visual-qa' : 'tim-taste';

    return {
      id: `${consensus.runId}:${consensus.surfaceId}:${finding.id}`,
      criteria,
      disposition,
      title:
        disposition === 'ship'
          ? `Visual QA: ${finding.summary}`
          : `Taste review: ${finding.summary}`,
      body: buildIssueBody({
        findingSummary: finding.summary,
        criteria,
        surfaceId: consensus.surfaceId,
        disposition,
        referenceComps,
      }),
      referenceComps,
      queue,
    };
  });
}
