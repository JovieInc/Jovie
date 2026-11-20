import {
  type AgentRunArtifact,
  AgentRunArtifactSchema,
  type VerificationGate,
} from '@/lib/agent-os/artifact';

/**
 * Schema-validated agent run fixtures shared by the agent-os certificate
 * tests and state stories, so every state stays inside the real contract.
 */
export const AGENT_OS_FIXTURE_NOW = '2026-01-15T12:00:00.000Z';

export const LONG_RUN_TITLE =
  'Add state stories, interaction tests and axe checks for every admin component still missing evidence';

export const LONG_RUN_SUMMARY =
  'This deliberately long summary describes a story-coverage batch touching many apps/web/components/features files so the row and drawer can be checked for clean truncation and wrapping at narrow widths without pushing the status pill out of view.';

export function buildGate(
  overrides: Partial<VerificationGate> = {}
): VerificationGate {
  return {
    name: 'github.ci',
    required: true,
    status: 'passed',
    evidenceUrl: null,
    summary: 'All checks passed.',
    checkedAt: AGENT_OS_FIXTURE_NOW,
    ...overrides,
  };
}

export function buildArtifact(
  overrides: Partial<AgentRunArtifact> = {}
): AgentRunArtifact {
  return AgentRunArtifactSchema.parse({
    id: 'run-1',
    source: 'github',
    sourceRunId: 'abc123',
    kind: 'code_review',
    status: 'done',
    title: 'Add stories for ranked feature components',
    summary:
      'Story-coverage batch touching 15 apps/web/components/features files.',
    modelRoute: 'claude-code',
    allowedActions: ['open_pr', 'ready_pr'],
    forbiddenActions: ['deploy'],
    humanApprovalRequired: false,
    humanGate: {
      required: false,
      status: 'not_required',
      reason: null,
      reviewer: null,
      reviewedAt: null,
    },
    linearIssueId: 'JOV-6778',
    linearIssueUrl: 'https://linear.app/jovieinc/issue/JOV-6778',
    pullRequestUrl: 'https://github.com/JovieInc/Jovie/pull/19385',
    adminSurface: null,
    verificationGates: [buildGate()],
    costEstimate: {
      usd: 0.42,
      route: 'claude-code',
      inputTokens: 120_000,
      outputTokens: 8_000,
      notes: null,
    },
    blockedReason: null,
    createdAt: AGENT_OS_FIXTURE_NOW,
    updatedAt: AGENT_OS_FIXTURE_NOW,
    metadata: {},
    ...overrides,
  });
}

/** A run waiting on a human reviewer. */
export function buildPendingApprovalArtifact(
  overrides: Partial<AgentRunArtifact> = {}
): AgentRunArtifact {
  return buildArtifact({
    status: 'review',
    humanApprovalRequired: true,
    humanGate: {
      required: true,
      status: 'pending',
      reason: null,
      reviewer: null,
      reviewedAt: null,
    },
    ...overrides,
  });
}

/** A failed run that a guard blocked. */
export function buildFailedArtifact(
  overrides: Partial<AgentRunArtifact> = {}
): AgentRunArtifact {
  return buildArtifact({
    id: 'run-failed',
    status: 'failed',
    title: 'Ship the admin HUD migration',
    blockedReason: 'CI failed on the head SHA; the migration test timed out.',
    verificationGates: [
      buildGate({ status: 'failed', summary: 'Unit tests failed.' }),
    ],
    ...overrides,
  });
}
