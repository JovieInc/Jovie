import {
  type AgentRunArtifact,
  parseAgentRunArtifact,
} from '@/lib/agent-os/artifact';
import type { VisualQaDiffRunSummary } from '@/lib/agent-os/visual-qa/diff-artifacts';

export interface AttachVisualQaDiffOptions {
  readonly artifactBaseUrl?: string;
}

export function attachVisualQaDiffsToAgentRunArtifact(
  artifact: AgentRunArtifact,
  diffSummary: VisualQaDiffRunSummary,
  options: AttachVisualQaDiffOptions = {}
): AgentRunArtifact {
  const driftedSurfaces = diffSummary.surfaces
    .filter(surface => surface.status === 'drift_detected')
    .map(surface => surface.surfaceId);
  const missingSurfaces = diffSummary.surfaces
    .filter(surface => surface.status === 'missing_capture')
    .map(surface => surface.surfaceId);

  const summaryText =
    diffSummary.passed && missingSurfaces.length === 0
      ? 'Visual QA pixel diff: no significant drift detected.'
      : [
          driftedSurfaces.length > 0
            ? `drift detected on ${driftedSurfaces.join(', ')}`
            : null,
          missingSurfaces.length > 0
            ? `missing captures for ${missingSurfaces.join(', ')}`
            : null,
        ]
          .filter(Boolean)
          .join('; ');

  const diffSummaryUrl =
    options.artifactBaseUrl === undefined
      ? null
      : `${options.artifactBaseUrl.replace(/\/$/, '')}/${diffSummary.runId}/diff-summary.json`;

  return parseAgentRunArtifact({
    ...artifact,
    metadata: {
      ...artifact.metadata,
      visualQaDiff: {
        runId: diffSummary.runId,
        computedAt: diffSummary.computedAt,
        passed: diffSummary.passed,
        summary: summaryText,
        diffSummaryPath: `${diffSummary.runId}/diff-summary.json`,
        surfaces: diffSummary.surfaces.map(surface => ({
          surfaceId: surface.surfaceId,
          title: surface.title,
          status: surface.status,
          rawDiffRatio: surface.rawDiffRatio,
          weightedDriftScore: surface.weightedDriftScore,
          threshold: surface.threshold,
          overlayPath: surface.overlayPath,
          regionScores: surface.regionScores,
        })),
      },
    },
    verificationGates: artifact.verificationGates.map(gate => {
      if (gate.name !== 'gstack.qa.exhaustive') {
        return gate;
      }

      const artifactUrls = [...(gate.artifactUrls ?? [])];
      if (diffSummaryUrl) {
        artifactUrls.push(diffSummaryUrl);
      }

      return {
        ...gate,
        artifactUrls: artifactUrls.length > 0 ? artifactUrls : undefined,
        status:
          diffSummary.passed && missingSurfaces.length === 0
            ? gate.status === 'missing'
              ? 'passed'
              : gate.status
            : 'failed',
        summary: summaryText,
        checkedAt: diffSummary.computedAt,
      };
    }),
  });
}
