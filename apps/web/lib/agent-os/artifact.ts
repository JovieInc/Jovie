import { z } from 'zod';

export const AGENT_RUN_SOURCES = [
  'github',
  'linear',
  'sentry',
  'hermes',
  'ci',
  'ruflo',
  'vercel-workflow',
] as const;

export const AGENT_RUN_KINDS = [
  'qa',
  'design_review',
  'code_review',
  'triage',
  'gtm',
  'yc',
  'cost',
  'deploy_readiness',
  'workflow',
] as const;

export const AGENT_RUN_STATUSES = [
  'queued',
  'running',
  'blocked',
  'review',
  'done',
  'failed',
  'stale',
] as const;

export const AGENT_RUN_MODEL_ROUTES = [
  'deterministic',
  'openrouter-free',
  'ai-sdk-gateway',
  'claude-code',
  'codex-cli',
] as const;

export const AGENT_RUN_ACTIONS = [
  'read',
  'classify',
  'rank',
  'summarize',
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
] as const;

export const AGENT_RUN_GATE_EVIDENCE_NAMES = [
  'gstack.qa.exhaustive',
  'gstack.review',
  'gstack.ship',
  'github.ci',
  'github.scope-judge',
  'github.coderabbit',
  'github.greptile',
  'github.branch-protection',
  'gstack.land-and-deploy',
  'sentry.canary',
] as const;

const nullableUrlSchema = z.union([z.string().trim().url(), z.null()]);
const nullableTextSchema = z.union([z.string().trim().min(1), z.null()]);
const isoDateTimeSchema = z.string().datetime();

export const AgentRunSourceSchema = z.enum(AGENT_RUN_SOURCES);
export const AgentRunKindSchema = z.enum(AGENT_RUN_KINDS);
export const AgentRunStatusSchema = z.enum(AGENT_RUN_STATUSES);
export const AgentRunModelRouteSchema = z.enum(AGENT_RUN_MODEL_ROUTES);
export const AgentRunActionSchema = z.enum(AGENT_RUN_ACTIONS);
export const AgentRunGateEvidenceNameSchema = z.enum(
  AGENT_RUN_GATE_EVIDENCE_NAMES
);

export const HumanGateStatusSchema = z.enum([
  'not_required',
  'pending',
  'approved',
  'rejected',
]);

export const VerificationGateStatusSchema = z.enum([
  'missing',
  'queued',
  'running',
  'passed',
  'failed',
  'skipped',
  'blocked',
]);

export const HumanGateSchema = z
  .object({
    required: z.boolean(),
    status: HumanGateStatusSchema,
    reason: nullableTextSchema,
    reviewer: nullableTextSchema,
    reviewedAt: z.union([isoDateTimeSchema, z.null()]),
  })
  .strict()
  .superRefine((gate, context) => {
    if (gate.required && gate.status === 'not_required') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Required human gates cannot use not_required status.',
        path: ['status'],
      });
    }

    if (!gate.required && gate.status !== 'not_required') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Optional human gates must use not_required status.',
        path: ['status'],
      });
    }
  });

export const VerificationGateSchema = z
  .object({
    name: AgentRunGateEvidenceNameSchema,
    required: z.boolean(),
    status: VerificationGateStatusSchema,
    evidenceUrl: nullableUrlSchema,
    summary: nullableTextSchema,
    checkedAt: z.union([isoDateTimeSchema, z.null()]),
  })
  .strict();

export const CostEstimateSchema = z
  .object({
    usd: z.number().min(0),
    route: AgentRunModelRouteSchema,
    inputTokens: z.number().int().min(0).nullable(),
    outputTokens: z.number().int().min(0).nullable(),
    notes: nullableTextSchema,
  })
  .strict();

export const AgentRunArtifactSchema = z
  .object({
    id: z.string().trim().min(1).max(180),
    source: AgentRunSourceSchema,
    sourceRunId: nullableTextSchema,
    kind: AgentRunKindSchema,
    status: AgentRunStatusSchema,
    title: z.string().trim().min(1).max(180),
    summary: z.string().trim().min(1).max(1200),
    modelRoute: AgentRunModelRouteSchema,
    allowedActions: z.array(AgentRunActionSchema).max(40),
    forbiddenActions: z.array(AgentRunActionSchema).max(40),
    humanApprovalRequired: z.boolean(),
    humanGate: HumanGateSchema,
    linearIssueId: nullableTextSchema,
    linearIssueUrl: nullableUrlSchema,
    pullRequestUrl: nullableUrlSchema,
    adminSurface: z.union([
      z.string().trim().startsWith('/').max(160),
      z.null(),
    ]),
    verificationGates: z.array(VerificationGateSchema).max(32),
    costEstimate: z.union([CostEstimateSchema, z.null()]),
    blockedReason: nullableTextSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    metadata: z.record(z.string(), z.unknown()),
  })
  .strict()
  .superRefine((artifact, context) => {
    if (artifact.humanApprovalRequired !== artifact.humanGate.required) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'humanApprovalRequired must match humanGate.required.',
        path: ['humanApprovalRequired'],
      });
    }

    if (artifact.status === 'blocked' && artifact.blockedReason === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Blocked runs must include blockedReason.',
        path: ['blockedReason'],
      });
    }
  });

export type AgentRunSource = z.infer<typeof AgentRunSourceSchema>;
export type AgentRunKind = z.infer<typeof AgentRunKindSchema>;
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;
export type AgentRunModelRoute = z.infer<typeof AgentRunModelRouteSchema>;
export type AgentRunAction = z.infer<typeof AgentRunActionSchema>;
export type AgentRunGateEvidenceName = z.infer<
  typeof AgentRunGateEvidenceNameSchema
>;
export type HumanGateStatus = z.infer<typeof HumanGateStatusSchema>;
export type VerificationGateStatus = z.infer<
  typeof VerificationGateStatusSchema
>;
export type HumanGate = z.infer<typeof HumanGateSchema>;
export type VerificationGate = z.infer<typeof VerificationGateSchema>;
export type CostEstimate = z.infer<typeof CostEstimateSchema>;
export type AgentRunArtifact = z.infer<typeof AgentRunArtifactSchema>;

export function parseAgentRunArtifact(input: unknown): AgentRunArtifact {
  return AgentRunArtifactSchema.parse(input);
}

export function safeParseAgentRunArtifact(input: unknown) {
  return AgentRunArtifactSchema.safeParse(input);
}
