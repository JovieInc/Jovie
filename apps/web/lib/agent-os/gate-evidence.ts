import type {
  AgentRunArtifact,
  AgentRunGateEvidenceName,
  VerificationGate,
} from '@/lib/agent-os/artifact';
import { safeParseAgentRunArtifact } from '@/lib/agent-os/artifact';

export const REQUIRED_NON_DRY_RUN_GSTACK_GATES = [
  'gstack.qa.exhaustive',
  'gstack.review',
  'gstack.ship',
] as const satisfies readonly AgentRunGateEvidenceName[];

const ARTIFACT_COMMENT_START = '<!-- agent-run-artifact';
const ARTIFACT_COMMENT_END = '-->';

export interface GateEvidenceEvaluation {
  readonly passed: boolean;
  readonly missingGateNames: readonly AgentRunGateEvidenceName[];
  readonly passedGateNames: readonly AgentRunGateEvidenceName[];
  readonly artifacts: readonly AgentRunArtifact[];
}

export function formatAgentRunArtifactComment(
  artifact: AgentRunArtifact
): string {
  return `<!-- agent-run-artifact\n${JSON.stringify(artifact, null, 2)}\n-->`;
}

export function extractAgentRunArtifactsFromMarkdown(
  markdown: string
): AgentRunArtifact[] {
  const artifacts: AgentRunArtifact[] = [];
  let searchStart = 0;

  while (searchStart < markdown.length) {
    const commentStart = markdown.indexOf(ARTIFACT_COMMENT_START, searchStart);
    if (commentStart === -1) {
      break;
    }

    const jsonStart = commentStart + ARTIFACT_COMMENT_START.length;
    const commentEnd = markdown.indexOf(ARTIFACT_COMMENT_END, jsonStart);
    if (commentEnd === -1) {
      break;
    }

    const rawJson = markdown.slice(jsonStart, commentEnd).trim();
    searchStart = commentEnd + ARTIFACT_COMMENT_END.length;
    if (!rawJson) {
      continue;
    }

    try {
      const parsed = safeParseAgentRunArtifact(JSON.parse(rawJson));
      if (parsed.success) {
        artifacts.push(parsed.data);
      }
    } catch {
      continue;
    }
  }

  return artifacts;
}

function gateHasRecordedEvidence(gate: VerificationGate): boolean {
  return gate.status === 'passed' && Boolean(gate.evidenceUrl ?? gate.summary);
}

export function evaluateAgentRunGateEvidence(
  markdown: string,
  requiredGateNames: readonly AgentRunGateEvidenceName[] = REQUIRED_NON_DRY_RUN_GSTACK_GATES
): GateEvidenceEvaluation {
  const artifacts = extractAgentRunArtifactsFromMarkdown(markdown);
  const passedGateNames = new Set<AgentRunGateEvidenceName>();

  for (const artifact of artifacts) {
    for (const gate of artifact.verificationGates) {
      if (
        requiredGateNames.includes(gate.name) &&
        gateHasRecordedEvidence(gate)
      ) {
        passedGateNames.add(gate.name);
      }
    }
  }

  const missingGateNames = requiredGateNames.filter(
    gateName => !passedGateNames.has(gateName)
  );

  return {
    passed: missingGateNames.length === 0,
    missingGateNames,
    passedGateNames: [...passedGateNames].sort((left, right) =>
      left.localeCompare(right)
    ),
    artifacts,
  };
}

export function buildGateEvidenceSummary(
  evaluation: GateEvidenceEvaluation
): string {
  if (evaluation.passed) {
    return `Recorded gate evidence found for: ${evaluation.passedGateNames.join(', ')}`;
  }

  return `Missing recorded gate evidence for: ${evaluation.missingGateNames.join(', ')}`;
}
