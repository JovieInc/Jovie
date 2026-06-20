import { listDesignTasteBenchmarkReferences } from './benchmarks';
import type { DesignTasteIssueFiling, DesignTasteJuryConsensus } from './types';

function buildIssueBody(params: {
  readonly findingSummary: string;
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
    const disposition = finding.objective ? 'ship' : finding.disposition;
    const queue = disposition === 'ship' ? 'visual-qa' : 'tim-taste';

    return {
      id: `${consensus.runId}:${consensus.surfaceId}:${finding.id}`,
      disposition,
      title:
        disposition === 'ship'
          ? `Visual QA: ${finding.summary}`
          : `Taste review: ${finding.summary}`,
      body: buildIssueBody({
        findingSummary: finding.summary,
        surfaceId: consensus.surfaceId,
        disposition,
        referenceComps,
      }),
      referenceComps,
      queue,
    };
  });
}
