import { APP_ROUTES } from '@/constants/routes';
import type { AgentRunArtifact } from '@/lib/agent-os/artifact';

interface AutoPrCapacityBlockedArtifactInput {
  readonly branchName: string;
  readonly runId: string;
  readonly repository: string;
  readonly openAgentPrs: number;
  readonly maxOpenAgentPrs: number;
  readonly waitedSeconds: number;
  readonly createdAt?: Date;
}

export function buildAutoPrCapacityBlockedArtifact({
  branchName,
  runId,
  repository,
  openAgentPrs,
  maxOpenAgentPrs,
  waitedSeconds,
  createdAt = new Date(),
}: AutoPrCapacityBlockedArtifactInput): AgentRunArtifact {
  const timestamp = createdAt.toISOString();

  return {
    id: `auto-pr-capacity-${runId}-${branchName.replaceAll(/[^a-zA-Z0-9._-]+/g, '-')}`,
    source: 'github',
    sourceRunId: runId,
    kind: 'workflow',
    status: 'blocked',
    title: 'Auto-PR capacity exhausted',
    summary: `Auto-PR creation for ${branchName} was blocked because ${openAgentPrs} agent PRs were already open.`,
    modelRoute: 'deterministic',
    allowedActions: ['read', 'open_pr'],
    forbiddenActions: [
      'ready_pr',
      'merge',
      'deploy',
      'mutate_linear',
      'send_outbound',
      'mutate_production_data',
      'change_auth',
      'change_billing',
      'change_security',
    ],
    humanApprovalRequired: false,
    humanGate: {
      required: false,
      status: 'not_required',
      reason: null,
      reviewer: null,
      reviewedAt: null,
    },
    linearIssueId: null,
    linearIssueUrl: null,
    pullRequestUrl: null,
    adminSurface: APP_ROUTES.ADMIN_OPS,
    verificationGates: [
      {
        name: 'github.ci',
        required: false,
        status: 'blocked',
        evidenceUrl: `https://github.com/${repository}/actions/runs/${runId}`,
        summary: 'Auto-PR capacity guard blocked PR creation.',
        checkedAt: timestamp,
      },
    ],
    costEstimate: {
      usd: 0,
      route: 'deterministic',
      inputTokens: 0,
      outputTokens: 0,
      notes: 'No model call was made.',
    },
    blockedReason: `Open agent PR count ${openAgentPrs} reached configured limit ${maxOpenAgentPrs} after ${waitedSeconds}s.`,
    createdAt: timestamp,
    updatedAt: timestamp,
    metadata: {
      branchName,
      repository,
      openAgentPrs,
      maxOpenAgentPrs,
      waitedSeconds,
    },
  };
}
