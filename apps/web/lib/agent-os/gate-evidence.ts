import type {
  AgentRunArtifact,
  AgentRunGateEvidenceName,
  VerificationGate,
} from '@/lib/agent-os/artifact';
import { safeParseAgentRunArtifact } from '@/lib/agent-os/artifact';

const ARTIFACT_COMMENT_START = '<!-- agent-run-artifact';
const ARTIFACT_COMMENT_END = '-->';

interface ArtifactCommentSlice {
  readonly aborted: boolean;
  readonly nextSearchStart: number;
  readonly rawJson: string;
}

export interface AgentRunArtifactIssue {
  readonly artifactIndex: number;
  readonly kind: 'malformed-json' | 'schema-invalid';
  readonly sourceRunId?: string;
  readonly details: readonly string[];
}

interface AgentRunArtifactExtraction {
  readonly artifacts: readonly AgentRunArtifact[];
  readonly issues: readonly AgentRunArtifactIssue[];
}

export interface GateEvidenceEvaluation {
  readonly passed: boolean;
  readonly missingGateNames: readonly AgentRunGateEvidenceName[];
  readonly passedGateNames: readonly AgentRunGateEvidenceName[];
  readonly artifacts: readonly AgentRunArtifact[];
  readonly artifactIssues: readonly AgentRunArtifactIssue[];
}

export interface GateEvidenceEvaluationOptions {
  readonly sourceRunId?: string;
}

export function formatAgentRunArtifactComment(
  artifact: AgentRunArtifact
): string {
  return `<!-- agent-run-artifact\n${JSON.stringify(artifact, null, 2)}\n-->`;
}

function advanceSearchAfterMalformed(commentStart: number): number {
  return commentStart + 1;
}

function readSourceRunId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const sourceRunId = Reflect.get(value, 'sourceRunId');
  return typeof sourceRunId === 'string' ? sourceRunId : undefined;
}

function formatSchemaIssue(issue: {
  readonly path: PropertyKey[];
  readonly message: string;
}): string {
  const path = issue.path.map(String).join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}

function hasCompleteJsonSlice(rawJson: string): boolean {
  try {
    JSON.parse(rawJson);
    return true;
  } catch {
    return false;
  }
}

function findCommentEndWithRecovery(
  markdown: string,
  commentStart: number,
  jsonStart: number
): ArtifactCommentSlice {
  let commentEnd = markdown.indexOf(ARTIFACT_COMMENT_END, jsonStart);

  if (commentEnd === -1) {
    return {
      aborted: true,
      nextSearchStart: advanceSearchAfterMalformed(commentStart),
      rawJson: '',
    };
  }

  while (commentEnd !== -1) {
    const rawJson = markdown.slice(jsonStart, commentEnd).trim();
    const nextSearchStart = commentEnd + ARTIFACT_COMMENT_END.length;

    if (!rawJson || hasCompleteJsonSlice(rawJson)) {
      return {
        aborted: false,
        nextSearchStart,
        rawJson,
      };
    }

    // A JSON string may contain "-->"; keep scanning for the real comment end.
    commentEnd = markdown.indexOf(ARTIFACT_COMMENT_END, nextSearchStart);
  }

  return {
    aborted: true,
    nextSearchStart: advanceSearchAfterMalformed(commentStart),
    rawJson: '',
  };
}

export function extractAgentRunArtifactsFromMarkdown(
  markdown: string
): AgentRunArtifact[] {
  return [...extractAgentRunArtifactReport(markdown).artifacts];
}

export function extractAgentRunArtifactReport(
  markdown: string
): AgentRunArtifactExtraction {
  const artifacts: AgentRunArtifact[] = [];
  const issues: AgentRunArtifactIssue[] = [];
  let searchStart = 0;
  let artifactIndex = 0;

  while (searchStart < markdown.length) {
    const commentStart = markdown.indexOf(ARTIFACT_COMMENT_START, searchStart);
    if (commentStart === -1) {
      break;
    }
    artifactIndex += 1;

    const jsonStart = commentStart + ARTIFACT_COMMENT_START.length;
    const commentSlice = findCommentEndWithRecovery(
      markdown,
      commentStart,
      jsonStart
    );
    searchStart = commentSlice.nextSearchStart;

    if (commentSlice.aborted || !commentSlice.rawJson) {
      issues.push({
        artifactIndex,
        kind: 'malformed-json',
        details: [
          'Artifact comment is unclosed, empty, or contains invalid JSON.',
        ],
      });
      continue;
    }

    const input = JSON.parse(commentSlice.rawJson) as unknown;
    const parsed = safeParseAgentRunArtifact(input);
    if (parsed.success) {
      artifacts.push(parsed.data);
    } else {
      issues.push({
        artifactIndex,
        kind: 'schema-invalid',
        sourceRunId: readSourceRunId(input),
        details: parsed.error.issues.map(formatSchemaIssue),
      });
    }
  }

  return { artifacts, issues };
}

function gateHasRecordedEvidence(gate: VerificationGate): boolean {
  return (
    gate.status === 'passed' &&
    (Boolean(gate.evidenceUrl?.trim()) ||
      Boolean(gate.summary?.trim()) ||
      Boolean(gate.artifactUrls?.some(url => url.trim().length > 0)))
  );
}

function getGateEvidenceTimestamp(
  artifact: AgentRunArtifact,
  gate: VerificationGate
): number {
  const timestamp = gate.checkedAt ?? artifact.updatedAt ?? artifact.createdAt;
  return Date.parse(timestamp);
}

/**
 * Evaluates recorded verification evidence.
 *
 * With an explicit `requiredGateNames` list, every named gate must have passed
 * with recorded evidence. Without one, agents choose which skills and gates
 * fit the change: the gates they declare are the contract, so at least one
 * gate must have passed with evidence and no gate they marked required (or
 * that last failed) may be outstanding. No skill, gstack included, is
 * mandatory by default.
 */
export function evaluateAgentRunGateEvidence(
  markdown: string,
  requiredGateNames?: readonly AgentRunGateEvidenceName[],
  options: GateEvidenceEvaluationOptions = {}
): GateEvidenceEvaluation {
  const extraction = extractAgentRunArtifactReport(markdown);
  const artifacts = extraction.artifacts.filter(
    artifact =>
      options.sourceRunId === undefined ||
      artifact.sourceRunId === options.sourceRunId
  );
  const artifactIssues = extraction.issues.filter(
    issue =>
      options.sourceRunId === undefined ||
      issue.sourceRunId === undefined ||
      issue.sourceRunId === options.sourceRunId
  );
  const explicitGateNameSet =
    requiredGateNames === undefined ? undefined : new Set(requiredGateNames);
  const latestGateState = new Map<
    AgentRunGateEvidenceName,
    {
      passed: boolean;
      blocking: boolean;
      timestamp: number;
      index: number;
    }
  >();
  let gateIndex = 0;

  for (const artifact of artifacts) {
    for (const gate of artifact.verificationGates) {
      if (explicitGateNameSet && !explicitGateNameSet.has(gate.name)) {
        continue;
      }

      const timestamp = getGateEvidenceTimestamp(artifact, gate);
      const current = latestGateState.get(gate.name);
      const passed = gateHasRecordedEvidence(gate);
      const nextState = {
        passed,
        blocking: !passed && (gate.required || gate.status === 'failed'),
        timestamp,
        index: gateIndex,
      };
      gateIndex += 1;

      if (
        current === undefined ||
        nextState.timestamp > current.timestamp ||
        (nextState.timestamp === current.timestamp &&
          nextState.index > current.index)
      ) {
        latestGateState.set(gate.name, nextState);
      }
    }
  }

  const evaluatedGateNames = requiredGateNames ?? [...latestGateState.keys()];
  const missingGateNames = evaluatedGateNames.filter(gateName => {
    const state = latestGateState.get(gateName);
    return requiredGateNames
      ? state?.passed !== true
      : state?.blocking === true;
  });
  const passedGateNames = evaluatedGateNames.filter(
    gateName => latestGateState.get(gateName)?.passed === true
  );

  return {
    passed:
      missingGateNames.length === 0 &&
      passedGateNames.length > 0 &&
      artifactIssues.length === 0,
    missingGateNames,
    passedGateNames,
    artifacts,
    artifactIssues,
  };
}

export function buildGateEvidenceSummary(
  evaluation: GateEvidenceEvaluation
): string {
  if (evaluation.passed) {
    return `Recorded gate evidence found for: ${evaluation.passedGateNames.join(', ')}`;
  }

  const lines: string[] = [];
  if (evaluation.artifactIssues.length > 0) {
    lines.push('Invalid agent-run artifact evidence:');
    for (const issue of evaluation.artifactIssues) {
      lines.push(
        `- artifact #${issue.artifactIndex} (${issue.kind}): ${issue.details.join('; ')}`
      );
    }
    lines.push(
      'Preflight the replacement before commenting: pnpm --filter @jovie/web exec tsx scripts/prepare-agent-gate-evidence.ts <artifact.json>'
    );
  }
  if (evaluation.missingGateNames.length > 0) {
    lines.push(
      `Missing recorded gate evidence for: ${evaluation.missingGateNames.join(', ')}`
    );
  }
  if (evaluation.passedGateNames.length === 0) {
    lines.push(
      'No verification gate has passed with recorded evidence. Record the checks this change actually needed (any gate name the agent chose).'
    );
  }
  return lines.join('\n');
}
