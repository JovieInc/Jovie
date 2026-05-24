import { getWritable } from 'workflow';
import { z } from 'zod';
import { APP_ROUTES } from '@/constants/routes';
import {
  type AgentRunArtifact,
  AgentRunHttpUrlSchema,
  parseAgentRunArtifact,
} from '@/lib/agent-os/artifact';

const DEFAULT_LINEAR_ISSUE_ID = 'JOV-1971';
const DEFAULT_LINEAR_ISSUE_URL =
  'https://linear.app/jovie/issue/JOV-1971/agentos-vercel-workflow-dry-run-artifact-proof';
const DEFAULT_SOURCE_RUN_ID = 'agentos-dry-run-unspecified';
const MAX_SOURCE_RUN_ID_LENGTH = 160;

export const AgentOsDryRunWorkflowInputSchema = z
  .object({
    requestedBy: z.string().trim().min(1).max(120).nullable().optional(),
    sourceRunId: z
      .string()
      .trim()
      .min(1)
      .max(MAX_SOURCE_RUN_ID_LENGTH)
      .nullable()
      .optional(),
    linearIssueId: z.string().trim().min(1).max(80).nullable().optional(),
    linearIssueUrl: AgentRunHttpUrlSchema.nullable().optional(),
  })
  .strict();

export type AgentOsDryRunWorkflowInput = z.infer<
  typeof AgentOsDryRunWorkflowInputSchema
>;

export type AgentOsDryRunWorkflowEvent =
  | {
      readonly type: 'agent_run_artifact';
      readonly artifact: AgentRunArtifact;
    }
  | {
      readonly type: 'agent_run_summary';
      readonly artifactId: string;
      readonly status: AgentRunArtifact['status'];
    };

interface BuildAgentOsDryRunArtifactInput {
  readonly input: AgentOsDryRunWorkflowInput;
  readonly createdAt?: Date;
}

function normalizeInput(
  input: AgentOsDryRunWorkflowInput
): Required<AgentOsDryRunWorkflowInput> {
  return {
    requestedBy: input.requestedBy ?? 'admin-ops',
    sourceRunId: input.sourceRunId ?? DEFAULT_SOURCE_RUN_ID,
    linearIssueId: input.linearIssueId ?? DEFAULT_LINEAR_ISSUE_ID,
    linearIssueUrl: input.linearIssueUrl ?? DEFAULT_LINEAR_ISSUE_URL,
  };
}

export function buildAgentOsDryRunArtifact({
  input,
  createdAt = new Date(),
}: BuildAgentOsDryRunArtifactInput): AgentRunArtifact {
  const normalized = normalizeInput(input);
  const timestamp = createdAt.toISOString();

  return parseAgentRunArtifact({
    id: `agentos-wdk-dry-run-${normalized.sourceRunId}`,
    source: 'vercel-workflow',
    sourceRunId: normalized.sourceRunId,
    kind: 'workflow',
    status: 'done',
    title: 'AgentOS Vercel Workflow dry run',
    summary:
      'Harmless WDK proof run emitted a canonical AgentRunArtifact without mutating external systems.',
    modelRoute: 'deterministic',
    allowedActions: ['read', 'summarize'],
    forbiddenActions: [
      'classify',
      'rank',
      'draft',
      'dispatch_agent',
      'write_code',
      'open_pr',
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
    linearIssueId: normalized.linearIssueId,
    linearIssueUrl: normalized.linearIssueUrl,
    pullRequestUrl: null,
    adminSurface: APP_ROUTES.ADMIN_OPS,
    verificationGates: [
      {
        name: 'github.ci',
        required: true,
        status: 'queued',
        evidenceUrl: null,
        summary: 'CI gate is queued for the implementation PR.',
        checkedAt: null,
      },
      {
        name: 'gstack.qa.exhaustive',
        required: true,
        status: 'queued',
        evidenceUrl: null,
        summary:
          'GStack exhaustive QA gate is queued for the implementation PR.',
        checkedAt: null,
      },
      {
        name: 'gstack.review',
        required: true,
        status: 'queued',
        evidenceUrl: null,
        summary: 'GStack review gate is queued for the implementation PR.',
        checkedAt: null,
      },
      {
        name: 'gstack.ship',
        required: true,
        status: 'queued',
        evidenceUrl: null,
        summary: 'GStack ship gate is queued for the implementation PR.',
        checkedAt: null,
      },
    ],
    costEstimate: {
      usd: 0,
      route: 'deterministic',
      inputTokens: 0,
      outputTokens: 0,
      notes: 'No model call was made.',
    },
    blockedReason: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    metadata: {
      dryRun: true,
      requestedBy: normalized.requestedBy,
      runtime: 'vercel-workflow',
      proof: 'artifact-emission',
    },
  });
}

export async function emitAgentOsDryRunArtifact(
  input: AgentOsDryRunWorkflowInput
): Promise<AgentRunArtifact> {
  'use step';

  console.log('[agentOsDryRun] START emit artifact');
  const parsedInput = AgentOsDryRunWorkflowInputSchema.parse(input);
  const artifact = buildAgentOsDryRunArtifact({ input: parsedInput });
  const writer = getWritable<AgentOsDryRunWorkflowEvent>().getWriter();

  try {
    await writer.write({ type: 'agent_run_artifact', artifact });
    await writer.write({
      type: 'agent_run_summary',
      artifactId: artifact.id,
      status: artifact.status,
    });
  } finally {
    writer.releaseLock();
  }

  console.log(`[agentOsDryRun] DONE artifactId=${artifact.id}`);
  return artifact;
}

export async function agentOsDryRunWorkflow(
  input: AgentOsDryRunWorkflowInput
): Promise<AgentRunArtifact> {
  'use workflow';

  console.log('[agentOsDryRunWorkflow] START');
  const artifact = await emitAgentOsDryRunArtifact(input);
  console.log('[agentOsDryRunWorkflow] DONE');
  return artifact;
}
