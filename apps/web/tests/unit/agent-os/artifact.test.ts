import { describe, expect, it } from 'vitest';
import {
  AGENT_RUN_GATE_EVIDENCE_NAMES,
  type AgentRunArtifact,
  AgentRunArtifactSchema,
  parseAgentRunArtifact,
  safeParseAgentRunArtifact,
} from '@/lib/agent-os/artifact';

const baseArtifact: AgentRunArtifact = {
  id: 'agent-run-001',
  source: 'vercel-workflow',
  sourceRunId: 'workflow-run-001',
  kind: 'workflow',
  status: 'running',
  title: 'Free model health dry run',
  summary: 'Harmless dry run proving AgentOS artifact emission.',
  modelRoute: 'deterministic',
  allowedActions: ['read', 'summarize'],
  forbiddenActions: ['merge', 'deploy', 'mutate_linear', 'write_code'],
  humanApprovalRequired: false,
  humanGate: {
    required: false,
    status: 'not_required',
    reason: null,
    reviewer: null,
    reviewedAt: null,
  },
  linearIssueId: 'JOV-1923',
  linearIssueUrl:
    'https://linear.app/jovie/issue/JOV-1923/agentos-shared-agentrunartifact-schema',
  pullRequestUrl: 'https://github.com/JovieInc/Jovie/pull/8192',
  adminSurface: '/app/admin/ops',
  verificationGates: [
    {
      name: 'gstack.qa.exhaustive',
      required: true,
      status: 'queued',
      evidenceUrl: null,
      summary: 'QA gate has not started yet.',
      checkedAt: null,
    },
    {
      name: 'github.ci',
      required: true,
      status: 'running',
      evidenceUrl: 'https://github.com/JovieInc/Jovie/actions/runs/123',
      summary: 'GitHub CI is running.',
      checkedAt: '2026-05-08T03:35:00.000Z',
    },
  ],
  costEstimate: {
    usd: 0,
    route: 'deterministic',
    inputTokens: null,
    outputTokens: null,
    notes: 'No model call in dry run.',
  },
  blockedReason: null,
  createdAt: '2026-05-08T03:30:00.000Z',
  updatedAt: '2026-05-08T03:35:00.000Z',
  metadata: {
    dryRun: true,
  },
};

describe('AgentRunArtifactSchema', () => {
  it('parses the canonical Vercel Workflow dry-run artifact shape', () => {
    const artifact = parseAgentRunArtifact(baseArtifact);

    expect(artifact.source).toBe('vercel-workflow');
    expect(artifact.modelRoute).toBe('deterministic');
    expect(artifact.verificationGates.map(gate => gate.name)).toEqual([
      'gstack.qa.exhaustive',
      'github.ci',
    ]);
  });

  it('keeps gate evidence names explicit and stable', () => {
    expect(AGENT_RUN_GATE_EVIDENCE_NAMES).toEqual([
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
    ]);
  });

  it('rejects blocked runs without a blocked reason', () => {
    const result = safeParseAgentRunArtifact({
      ...baseArtifact,
      status: 'blocked',
      blockedReason: null,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['blockedReason']);
  });

  it('rejects human-gate mismatches', () => {
    const result = AgentRunArtifactSchema.safeParse({
      ...baseArtifact,
      humanApprovalRequired: true,
      humanGate: {
        ...baseArtifact.humanGate,
        required: false,
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['humanApprovalRequired']);
  });

  it('accepts read-only OpenRouter free-model artifacts with forbidden mutations', () => {
    const artifact = parseAgentRunArtifact({
      ...baseArtifact,
      id: 'agent-run-002',
      source: 'hermes',
      kind: 'triage',
      status: 'done',
      modelRoute: 'openrouter-free',
      allowedActions: ['read', 'classify', 'rank', 'summarize', 'draft'],
      forbiddenActions: [
        'write_code',
        'send_outbound',
        'deploy',
        'merge',
        'change_auth',
        'change_billing',
        'change_security',
        'mutate_production_data',
      ],
      costEstimate: {
        usd: 0,
        route: 'openrouter-free',
        inputTokens: 1200,
        outputTokens: 250,
        notes: 'Free-model route.',
      },
      updatedAt: '2026-05-08T03:40:00.000Z',
    });

    expect(artifact.forbiddenActions).toContain('write_code');
    expect(artifact.costEstimate?.route).toBe('openrouter-free');
  });
});
