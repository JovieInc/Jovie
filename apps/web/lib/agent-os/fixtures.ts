import { APP_ROUTES } from '@/constants/routes';
import type {
  AgentRunAction,
  AgentRunArtifact,
  AgentRunKind,
  AgentRunModelRoute,
  AgentRunSource,
  AgentRunStatus,
  VerificationGate,
} from './artifact';

const CREATED_AT = '2026-05-08T18:00:00.000Z';
const CHECKED_AT = '2026-05-08T20:30:00.000Z';
const JOVIE_LINEAR_ISSUE_URL = 'https://linear.app/jovie/issue';
const JOVIE_GITHUB_PULL_URL = 'https://github.com/JovieInc/Jovie/pull';

const DEFAULT_ALLOWED_ACTIONS: readonly AgentRunAction[] = [
  'read',
  'summarize',
];
const DEFAULT_FORBIDDEN_ACTIONS: readonly AgentRunAction[] = [
  'merge',
  'deploy',
  'mutate_production_data',
];
const CONTROL_PLANE_FORBIDDEN_ACTIONS: readonly AgentRunAction[] = [
  'write_code',
  'merge',
  'deploy',
  'mutate_linear',
  'send_outbound',
  'mutate_production_data',
  'change_auth',
  'change_billing',
  'change_security',
];

type FixtureArtifactInput = Omit<
  AgentRunArtifact,
  'adminSurface' | 'createdAt' | 'metadata'
> & {
  readonly createdAt?: string;
  readonly metadata?: Record<string, unknown>;
};

type FixtureIssueLink = {
  readonly id: string;
  readonly slug: string;
};

type FixtureSeed = {
  readonly id: string;
  readonly source: AgentRunSource;
  readonly sourceRunId: string | null;
  readonly kind: AgentRunKind;
  readonly status: AgentRunStatus;
  readonly title: string;
  readonly summary: string;
  readonly modelRoute?: AgentRunModelRoute;
  readonly allowedActions?: readonly AgentRunAction[];
  readonly forbiddenActions?: readonly AgentRunAction[];
  readonly humanApprovalReason?: string;
  readonly linearIssue?: FixtureIssueLink;
  readonly pullRequest?: number;
  readonly verificationGates: readonly VerificationGate[];
  readonly costNotes?: string;
  readonly costTokens?: readonly [number | null, number | null];
  readonly blockedReason?: string;
  readonly updatedAt: string;
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

function linearIssueUrl(issue: FixtureIssueLink): string {
  return `${JOVIE_LINEAR_ISSUE_URL}/${issue.id}/${issue.slug}`;
}

function pullRequestUrl(number: number): string {
  return `${JOVIE_GITHUB_PULL_URL}/${number}`;
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

function artifactFromSeed(seed: FixtureSeed): AgentRunArtifact {
  const modelRoute = seed.modelRoute ?? 'deterministic';
  const humanGate = seed.humanApprovalReason
    ? pendingHumanGate(seed.humanApprovalReason)
    : noHumanGate();
  const [inputTokens, outputTokens] = seed.costTokens ?? [0, 0];

  return fixtureArtifact({
    id: seed.id,
    source: seed.source,
    sourceRunId: seed.sourceRunId,
    kind: seed.kind,
    status: seed.status,
    title: seed.title,
    summary: seed.summary,
    modelRoute,
    allowedActions: [...(seed.allowedActions ?? DEFAULT_ALLOWED_ACTIONS)],
    forbiddenActions: [...(seed.forbiddenActions ?? DEFAULT_FORBIDDEN_ACTIONS)],
    humanApprovalRequired: humanGate.required,
    humanGate,
    linearIssueId: seed.linearIssue?.id ?? null,
    linearIssueUrl: seed.linearIssue ? linearIssueUrl(seed.linearIssue) : null,
    pullRequestUrl:
      seed.pullRequest === undefined ? null : pullRequestUrl(seed.pullRequest),
    verificationGates: [...seed.verificationGates],
    costEstimate: zeroCost(
      modelRoute,
      seed.costNotes ?? 'No model call.',
      inputTokens,
      outputTokens
    ),
    blockedReason: seed.blockedReason ?? null,
    updatedAt: seed.updatedAt,
  });
}

const AGENT_OS_ADMIN_FIXTURE_SEEDS: readonly FixtureSeed[] = [
  {
    id: 'agentos-run-queued-wdk-health',
    source: 'vercel-workflow',
    sourceRunId: 'wrun_agentos_health_001',
    kind: 'workflow',
    status: 'queued',
    title: 'WDK health dry run',
    summary:
      'Queued harmless workflow proof that emits an AgentRunArtifact without schedules, deploys, Linear mutation, or model calls.',
    forbiddenActions: CONTROL_PLANE_FORBIDDEN_ACTIONS,
    linearIssue: {
      id: 'JOV-1971',
      slug: 'agentos-vercel-workflow-dry-run-artifact-proof',
    },
    pullRequest: 8282,
    verificationGates: [
      gate('github.ci', 'queued', 'Waiting for GitHub Actions.'),
      gate('gstack.qa.exhaustive', 'missing', 'QA evidence not recorded yet.'),
      gate('gstack.review', 'missing', 'Review evidence not recorded yet.'),
    ],
    updatedAt: '2026-05-08T18:05:00.000Z',
  },
  {
    id: 'agentos-run-running-main-tail',
    source: 'ci',
    sourceRunId: '25582719008',
    kind: 'deploy_readiness',
    status: 'running',
    title: 'Main post-merge verification',
    summary:
      'Main branch deploy path is watching unit shards, production Lighthouse, smoke, auth smoke, and Sentry soak gates.',
    forbiddenActions: ['merge', 'deploy', 'mutate_linear', 'send_outbound'],
    linearIssue: {
      id: 'JOV-1971',
      slug: 'agentos-vercel-workflow-dry-run-artifact-proof',
    },
    pullRequest: 8282,
    verificationGates: [
      gate('github.ci', 'running', 'Main CI is still reporting active jobs.'),
      gate('sentry.canary', 'running', 'Production Sentry soak is active.'),
    ],
    costNotes: 'Status read only.',
    updatedAt: '2026-05-08T22:45:00.000Z',
  },
  {
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
    humanApprovalReason:
      'Human approval required before AgentOS moves beyond dry-run.',
    linearIssue: {
      id: 'JOV-1926',
      slug: 'agentos-enforce-gstack-gates-before-non-dry-run-agents',
    },
    pullRequest: 8282,
    verificationGates: [
      gate('gstack.qa.exhaustive', 'passed', 'Focused QA evidence recorded.'),
      gate('gstack.review', 'passed', 'Bot and human review threads resolved.'),
      gate('gstack.ship', 'passed', 'Ship gate evidence recorded.'),
      gate('gstack.land-and-deploy', 'running', 'Landing sequence active.'),
    ],
    costNotes: 'Local coding agent route.',
    costTokens: [null, null],
    updatedAt: '2026-05-08T22:20:00.000Z',
  },
  {
    id: 'agentos-run-blocked-trigger-check',
    source: 'github',
    sourceRunId: '75105012992',
    kind: 'deploy_readiness',
    status: 'blocked',
    title: 'Trigger.dev deploy check mismatch',
    summary:
      'External Trigger.dev production deployment integration is active while AgentOS is intentionally WDK-first.',
    allowedActions: ['read', 'summarize', 'draft'],
    forbiddenActions: ['deploy', 'merge', 'mutate_production_data'],
    humanApprovalReason:
      'Infra owner must disable or reconfigure the Trigger.dev project.',
    linearIssue: {
      id: 'JOV-1994',
      slug: 'agentos-disable-stale-triggerdev-production-deploy-check-while-wdk-is',
    },
    verificationGates: [
      gate(
        'github.ci',
        'blocked',
        'External Trigger.dev check reports missing trigger.config.ts.'
      ),
    ],
    costNotes: 'Infra status only.',
    blockedReason:
      'Trigger.dev deploy integration expects trigger.config.ts before the fallback runtime PR exists.',
    updatedAt: '2026-05-08T22:40:00.000Z',
  },
  {
    id: 'agentos-run-failed-unsafe-payload',
    source: 'hermes',
    sourceRunId: 'hermes_dispatch_rejected_001',
    kind: 'triage',
    status: 'failed',
    title: 'Unsafe dispatch payload rejected',
    summary:
      'Hermes rejected a non-dry-run payload because requested paths and forbidden actions exceeded the approved manifest.',
    allowedActions: ['read', 'classify', 'summarize'],
    forbiddenActions: ['write_code', 'merge', 'deploy', 'mutate_linear'],
    linearIssue: {
      id: 'JOV-1926',
      slug: 'agentos-enforce-gstack-gates-before-non-dry-run-agents',
    },
    verificationGates: [
      gate(
        'github.scope-judge',
        'failed',
        'Changed-file guard rejected out-of-scope paths.'
      ),
    ],
    costNotes: 'Rejected before model routing.',
    updatedAt: '2026-05-08T19:15:00.000Z',
  },
  {
    id: 'agentos-run-done-schema-pr',
    source: 'github',
    sourceRunId: '8240',
    kind: 'workflow',
    status: 'done',
    title: 'AgentRunArtifact schema landed',
    summary:
      'Canonical AgentRunArtifact schema is available for GitHub, Linear, Hermes, Ruflo, CI, and Vercel Workflow adapters.',
    linearIssue: {
      id: 'JOV-1923',
      slug: 'agentos-shared-agentrunartifact-schema',
    },
    pullRequest: 8240,
    verificationGates: [
      gate('github.ci', 'passed', 'CI passed.'),
      gate('gstack.review', 'passed', 'Review gate passed.'),
      gate('gstack.ship', 'passed', 'Ship gate passed.'),
    ],
    updatedAt: '2026-05-08T18:30:00.000Z',
  },
];

export const AGENT_OS_ADMIN_FIXTURE_ARTIFACTS: readonly AgentRunArtifact[] =
  AGENT_OS_ADMIN_FIXTURE_SEEDS.map(artifactFromSeed);
