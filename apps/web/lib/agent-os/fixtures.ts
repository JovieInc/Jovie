import { APP_ROUTES } from '@/constants/routes';
import type { AgentRunArtifact, VerificationGate } from './artifact';

const CREATED_AT = '2026-05-08T18:00:00.000Z';
const CHECKED_AT = '2026-05-08T20:30:00.000Z';

type FixtureArtifactInput = Omit<
  AgentRunArtifact,
  'adminSurface' | 'createdAt' | 'metadata'
> & {
  readonly createdAt?: string;
  readonly metadata?: Record<string, unknown>;
};

function gate(
  name: VerificationGate['name'],
  status: VerificationGate['status'],
  summary: string,
  required = true
): VerificationGate {
  return {
    name,
    required,
    status,
    evidenceUrl: null,
    summary,
    checkedAt: status === 'missing' || status === 'queued' ? null : CHECKED_AT,
  };
}

function noHumanGate(): AgentRunArtifact['humanGate'] {
  return {
    required: false,
    status: 'not_required',
    reason: null,
    reviewer: null,
    reviewedAt: null,
  };
}

function pendingHumanGate(reason: string): AgentRunArtifact['humanGate'] {
  return {
    required: true,
    status: 'pending',
    reason,
    reviewer: null,
    reviewedAt: null,
  };
}

function zeroCost(
  route: AgentRunArtifact['modelRoute'],
  notes: string,
  inputTokens: number | null = 0,
  outputTokens: number | null = 0
): AgentRunArtifact['costEstimate'] {
  return {
    usd: 0,
    route,
    inputTokens,
    outputTokens,
    notes,
  };
}

function fixtureArtifact(input: FixtureArtifactInput): AgentRunArtifact {
  const { createdAt = CREATED_AT, metadata, ...artifact } = input;

  return {
    ...artifact,
    adminSurface: APP_ROUTES.ADMIN_OPS,
    createdAt,
    metadata: { fixture: true, ...metadata },
  };
}

export const AGENT_OS_ADMIN_FIXTURE_ARTIFACTS: readonly AgentRunArtifact[] = [
  fixtureArtifact({
    id: 'agentos-run-queued-wdk-health',
    source: 'vercel-workflow',
    sourceRunId: 'wrun_agentos_health_001',
    kind: 'workflow',
    status: 'queued',
    title: 'WDK health dry run',
    summary:
      'Queued harmless workflow proof that emits an AgentRunArtifact without schedules, deploys, Linear mutation, or model calls.',
    modelRoute: 'deterministic',
    allowedActions: ['read', 'summarize'],
    forbiddenActions: [
      'write_code',
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
    humanGate: noHumanGate(),
    linearIssueId: 'JOV-1971',
    linearIssueUrl:
      'https://linear.app/jovie/issue/JOV-1971/agentos-vercel-workflow-dry-run-artifact-proof',
    pullRequestUrl: 'https://github.com/JovieInc/Jovie/pull/8282',
    verificationGates: [
      gate('github.ci', 'queued', 'Waiting for GitHub Actions.'),
      gate('gstack.qa.exhaustive', 'missing', 'QA evidence not recorded yet.'),
      gate('gstack.review', 'missing', 'Review evidence not recorded yet.'),
    ],
    costEstimate: zeroCost('deterministic', 'No model call.'),
    blockedReason: null,
    updatedAt: '2026-05-08T18:05:00.000Z',
  }),
  fixtureArtifact({
    id: 'agentos-run-running-main-tail',
    source: 'ci',
    sourceRunId: '25582719008',
    kind: 'deploy_readiness',
    status: 'running',
    title: 'Main post-merge verification',
    summary:
      'Main branch deploy path is watching unit shards, production Lighthouse, smoke, auth smoke, and Sentry soak gates.',
    modelRoute: 'deterministic',
    allowedActions: ['read', 'summarize'],
    forbiddenActions: ['merge', 'deploy', 'mutate_linear', 'send_outbound'],
    humanApprovalRequired: false,
    humanGate: noHumanGate(),
    linearIssueId: 'JOV-1971',
    linearIssueUrl:
      'https://linear.app/jovie/issue/JOV-1971/agentos-vercel-workflow-dry-run-artifact-proof',
    pullRequestUrl: 'https://github.com/JovieInc/Jovie/pull/8282',
    verificationGates: [
      gate('github.ci', 'running', 'Main CI is still reporting active jobs.'),
      gate('sentry.canary', 'running', 'Production Sentry soak is active.'),
    ],
    costEstimate: zeroCost('deterministic', 'Status read only.'),
    blockedReason: null,
    updatedAt: '2026-05-08T22:45:00.000Z',
  }),
  fixtureArtifact({
    id: 'agentos-run-review-gstack-ship',
    source: 'github',
    sourceRunId: '8282',
    kind: 'code_review',
    status: 'review',
    title: 'Review GStack ship evidence',
    summary:
      'Ready PR requires recorded exhaustive QA, review, ship, and land evidence before non-dry-run AgentOS dispatch is allowed.',
    modelRoute: 'codex-cli',
    allowedActions: ['read', 'summarize', 'draft'],
    forbiddenActions: [
      'ready_pr',
      'merge',
      'deploy',
      'mutate_production_data',
      'change_auth',
      'change_billing',
      'change_security',
    ],
    humanApprovalRequired: true,
    humanGate: pendingHumanGate(
      'Human approval required before AgentOS moves beyond dry-run.'
    ),
    linearIssueId: 'JOV-1926',
    linearIssueUrl:
      'https://linear.app/jovie/issue/JOV-1926/agentos-enforce-gstack-gates-before-non-dry-run-agents',
    pullRequestUrl: 'https://github.com/JovieInc/Jovie/pull/8282',
    verificationGates: [
      gate('gstack.qa.exhaustive', 'passed', 'Focused QA evidence recorded.'),
      gate('gstack.review', 'passed', 'Bot and human review threads resolved.'),
      gate('gstack.ship', 'passed', 'Ship gate evidence recorded.'),
      gate('gstack.land-and-deploy', 'running', 'Landing sequence active.'),
    ],
    costEstimate: zeroCost(
      'codex-cli',
      'Local coding agent route.',
      null,
      null
    ),
    blockedReason: null,
    updatedAt: '2026-05-08T22:20:00.000Z',
  }),
  fixtureArtifact({
    id: 'agentos-run-blocked-trigger-check',
    source: 'github',
    sourceRunId: '75105012992',
    kind: 'deploy_readiness',
    status: 'blocked',
    title: 'Trigger.dev deploy check mismatch',
    summary:
      'External Trigger.dev production deployment integration is active while AgentOS is intentionally WDK-first.',
    modelRoute: 'deterministic',
    allowedActions: ['read', 'summarize', 'draft'],
    forbiddenActions: ['deploy', 'merge', 'mutate_production_data'],
    humanApprovalRequired: true,
    humanGate: pendingHumanGate(
      'Infra owner must disable or reconfigure the Trigger.dev project.'
    ),
    linearIssueId: 'JOV-1994',
    linearIssueUrl:
      'https://linear.app/jovie/issue/JOV-1994/agentos-disable-stale-triggerdev-production-deploy-check-while-wdk-is',
    pullRequestUrl: null,
    verificationGates: [
      gate(
        'github.ci',
        'blocked',
        'External Trigger.dev check reports missing trigger.config.ts.'
      ),
    ],
    costEstimate: zeroCost('deterministic', 'Infra status only.'),
    blockedReason:
      'Trigger.dev deploy integration expects trigger.config.ts before the fallback runtime PR exists.',
    updatedAt: '2026-05-08T22:40:00.000Z',
  }),
  fixtureArtifact({
    id: 'agentos-run-failed-unsafe-payload',
    source: 'hermes',
    sourceRunId: 'hermes_dispatch_rejected_001',
    kind: 'triage',
    status: 'failed',
    title: 'Unsafe dispatch payload rejected',
    summary:
      'Hermes rejected a non-dry-run payload because requested paths and forbidden actions exceeded the approved manifest.',
    modelRoute: 'deterministic',
    allowedActions: ['read', 'classify', 'summarize'],
    forbiddenActions: ['write_code', 'merge', 'deploy', 'mutate_linear'],
    humanApprovalRequired: false,
    humanGate: noHumanGate(),
    linearIssueId: 'JOV-1926',
    linearIssueUrl:
      'https://linear.app/jovie/issue/JOV-1926/agentos-enforce-gstack-gates-before-non-dry-run-agents',
    pullRequestUrl: null,
    verificationGates: [
      gate(
        'github.scope-judge',
        'failed',
        'Changed-file guard rejected out-of-scope paths.'
      ),
    ],
    costEstimate: zeroCost('deterministic', 'Rejected before model routing.'),
    blockedReason: null,
    updatedAt: '2026-05-08T19:15:00.000Z',
  }),
  fixtureArtifact({
    id: 'agentos-run-done-schema-pr',
    source: 'github',
    sourceRunId: '8240',
    kind: 'workflow',
    status: 'done',
    title: 'AgentRunArtifact schema landed',
    summary:
      'Canonical AgentRunArtifact schema is available for GitHub, Linear, Hermes, Ruflo, CI, and Vercel Workflow adapters.',
    modelRoute: 'deterministic',
    allowedActions: ['read', 'summarize'],
    forbiddenActions: ['merge', 'deploy', 'mutate_production_data'],
    humanApprovalRequired: false,
    humanGate: noHumanGate(),
    linearIssueId: 'JOV-1923',
    linearIssueUrl:
      'https://linear.app/jovie/issue/JOV-1923/agentos-shared-agentrunartifact-schema',
    pullRequestUrl: 'https://github.com/JovieInc/Jovie/pull/8240',
    verificationGates: [
      gate('github.ci', 'passed', 'CI passed.'),
      gate('gstack.review', 'passed', 'Review gate passed.'),
      gate('gstack.ship', 'passed', 'Ship gate passed.'),
    ],
    costEstimate: zeroCost('deterministic', 'No model call.'),
    blockedReason: null,
    updatedAt: '2026-05-08T18:30:00.000Z',
  }),
];
