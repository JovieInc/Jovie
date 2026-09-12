/**
 * Gem-independent Cursor Cloud recovery lane for Summer.
 *
 * Summer requests an isolated recovery outcome; the canonical router selects
 * Cursor Cloud when Gem is dark (or an explicit preauth recovery grant exists).
 * Does not take over uncertain live jobs or mutate live services.
 */

import {
  type ExecutionJob,
  NoCertifiedRouteError,
  type RouteCandidate,
  type RouteReceipt,
  routeByExpectedCost,
} from './governor-route';

export const CURSOR_RECOVERY_ADAPTER_VERSION = '2026-09-12' as const;
export const CURSOR_AGENTS_URL = 'https://api.cursor.com/v0/agents';

export type RecoveryAdmissionContext = {
  readonly gemDark: boolean;
  readonly preauthorizedRecovery: boolean;
  readonly liveOwnershipResolved: boolean;
  readonly requestsLiveMutationOrTakeover: boolean;
  /** Summer attempted to grant itself a closed capability. */
  readonly requestsPermissionSelfExpansion?: boolean;
  /** Caller wants a live Gem service mutation (restart/heal/deploy). */
  readonly requestsGemDependentLiveMutation?: boolean;
  /** Known live job ids whose ownership is unresolved. */
  readonly uncertainLiveJobIds?: readonly string[];
};

export type RecoveryDisposition =
  | {
      readonly status: 'admit';
      readonly lane: 'cursor-cloud';
      readonly reason: string;
    }
  | {
      readonly status: 'deny';
      readonly code:
        | 'live-takeover-without-ownership'
        | 'no-recovery-grant'
        | 'permission-self-expansion'
        | 'uncertain-live-job-duplication';
      readonly message: string;
    }
  | {
      readonly status: 'hold';
      readonly namedGap: 'gem-dependent-live-mutation-requires-gem';
      readonly remainingHumanDecision: string;
      readonly message: string;
    };

export type CursorLaunchAcceptance = {
  readonly agentId: string;
  readonly runId: string;
};

export type CursorRecoveryStatus =
  | 'accepted'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export type CursorRecoveryReceipt = {
  readonly schema: 'jovie.summer.cursor-recovery/v1';
  readonly adapterVersion: typeof CURSOR_RECOVERY_ADAPTER_VERSION;
  readonly jobId: string;
  readonly routeId: string;
  readonly agentId: string;
  readonly runId: string;
  readonly status: CursorRecoveryStatus;
  readonly artifactUrl?: string;
  readonly remainingHumanDecision?: string;
  readonly observedAt: string;
};

export class RecoveryAdmissionDeniedError extends Error {
  constructor(
    readonly code:
      | 'gem-available-use-normal-route'
      | 'live-takeover-without-ownership'
      | 'no-recovery-grant'
      | 'permission-self-expansion'
      | 'uncertain-live-job-duplication',
    message: string
  ) {
    super(message);
    this.name = 'RecoveryAdmissionDeniedError';
  }
}

export const CURSOR_CLOUD_RECOVERY_ROUTE: RouteCandidate = {
  id: 'cursor-cloud-isolated-recovery',
  tuple: {
    model: 'cursor-cloud-agent',
    provider: 'cursor-cloud',
    cli: 'cursor-cloud-agents-api',
    configVersion: CURSOR_RECOVERY_ADAPTER_VERSION,
    tools: ['github', 'repo-read', 'test'],
    reviewPlan: 'postflight',
  },
  estimatedTokenCost: 25,
  reviewCost: 8,
  failureRiskCost: 12,
  certifiedSuccessProbability: 0.8,
  expectedRetries: 1,
  capabilityMatch: [
    'isolated-recovery',
    'diagnostics',
    'pr-preparation',
    'reasoning',
  ],
  maxRiskTier: 'high',
};

/**
 * Gem-dark failure disposition (E4).
 * Isolated recovery may admit; live mutation/takeover/self-expansion do not.
 */
export function disposeGemDarkRecovery(
  context: RecoveryAdmissionContext
): RecoveryDisposition {
  if (context.requestsPermissionSelfExpansion) {
    return {
      status: 'deny',
      code: 'permission-self-expansion',
      message:
        'Summer cannot expand its own permissions (privileged-gbrain-write / symphony-heal remain closed)',
    };
  }

  if (
    (context.uncertainLiveJobIds?.length ?? 0) > 0 &&
    context.requestsLiveMutationOrTakeover
  ) {
    return {
      status: 'deny',
      code: 'uncertain-live-job-duplication',
      message:
        'Refusing to duplicate or take over uncertain live jobs without ownership reconciliation',
    };
  }

  if (
    context.requestsLiveMutationOrTakeover &&
    !context.liveOwnershipResolved
  ) {
    return {
      status: 'deny',
      code: 'live-takeover-without-ownership',
      message:
        'Cannot take over or mutate a live job without authoritative ownership reconciliation',
    };
  }

  if (context.requestsGemDependentLiveMutation) {
    return {
      status: 'hold',
      namedGap: 'gem-dependent-live-mutation-requires-gem',
      remainingHumanDecision:
        'Authorize Gem restore or approve an explicit live-mutation runbook; isolated Cursor recovery cannot mutate Gem services',
      message:
        'Gem-dependent live mutation held — Gem is required for live service mutation',
    };
  }

  if (!context.gemDark && !context.preauthorizedRecovery) {
    return {
      status: 'deny',
      code: 'no-recovery-grant',
      message:
        'Cursor recovery requires Gem dark or an explicit preauthorized recovery grant',
    };
  }

  return {
    status: 'admit',
    lane: 'cursor-cloud',
    reason: context.gemDark
      ? 'Gem dark — isolated Cursor recovery admitted'
      : 'Preauthorized recovery grant — isolated Cursor recovery admitted',
  };
}

export function assertRecoveryAdmission(
  context: RecoveryAdmissionContext
): void {
  const disposition = disposeGemDarkRecovery(context);
  if (disposition.status === 'admit') return;
  if (disposition.status === 'hold') {
    throw new RecoveryAdmissionDeniedError(
      'no-recovery-grant',
      `${disposition.namedGap}: ${disposition.message}`
    );
  }
  throw new RecoveryAdmissionDeniedError(disposition.code, disposition.message);
}

export function routeIsolatedRecoveryJob(
  job: ExecutionJob,
  context: RecoveryAdmissionContext
): RouteReceipt {
  assertRecoveryAdmission(context);
  if (!job.requiredCapabilities.includes('isolated-recovery')) {
    throw new NoCertifiedRouteError(job);
  }
  return routeByExpectedCost(
    job,
    [CURSOR_CLOUD_RECOVERY_ROUTE],
    `cursor-recovery-${CURSOR_RECOVERY_ADAPTER_VERSION}`
  );
}

export function createIsolatedRecoveryJob(input: {
  readonly id: string;
  readonly objective: string;
  readonly evidenceRefs: readonly string[];
  readonly authority?: ExecutionJob['authority'];
}): ExecutionJob {
  return {
    kind: 'execution',
    id: input.id,
    jobClass: 'ambiguous-product-reasoning',
    riskTier: 'high',
    objective: input.objective,
    requiredCapabilities: [
      'isolated-recovery',
      'diagnostics',
      'pr-preparation',
    ],
    certificationPredicate:
      'isolated-diagnostic-or-pr-prep-only-no-live-service-mutation',
    authority: input.authority ?? 'automation',
    evidenceRefs: input.evidenceRefs,
    payload: {
      mutationAllowed: false,
      excludeExecutionLocation: 'gem',
    },
  };
}

function cursorAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
}

export async function launchCursorRecoveryAgent(input: {
  readonly cursorApiKey: string;
  readonly prompt: string;
  readonly repository: string;
  readonly ref?: string;
  readonly fetchImpl?: typeof fetch;
}): Promise<CursorLaunchAcceptance> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(CURSOR_AGENTS_URL, {
    method: 'POST',
    headers: {
      Authorization: cursorAuthHeader(input.cursorApiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: { text: input.prompt },
      source: {
        repository: input.repository,
        ref: input.ref ?? 'main',
      },
    }),
  });
  const raw = await response.text();
  let body: {
    agent?: { id?: string };
    run?: { id?: string; agentId?: string };
  } = {};
  try {
    body = raw ? (JSON.parse(raw) as typeof body) : {};
  } catch {
    throw new Error('cursor launch returned non-JSON body');
  }
  if (!response.ok) {
    throw new Error(`cursor launch failed: ${response.status}`);
  }
  const agentId = body.agent?.id;
  const runId = body.run?.id;
  if (
    typeof agentId !== 'string' ||
    agentId.length === 0 ||
    typeof runId !== 'string' ||
    runId.length === 0 ||
    body.run?.agentId !== agentId
  ) {
    throw new Error('cursor launch returned no bound agent/run acceptance');
  }
  return { agentId, runId };
}

export async function reconcileCursorRecoveryRun(input: {
  readonly cursorApiKey: string;
  readonly agentId: string;
  readonly runId: string;
  readonly jobId: string;
  readonly routeId: string;
  readonly timeoutMs: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly fetchImpl?: typeof fetch;
  readonly pollIntervalMs?: number;
}): Promise<CursorRecoveryReceipt> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? Date.now;
  const sleep =
    input.sleep ??
    ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)));
  const started = now();
  const pollIntervalMs = input.pollIntervalMs ?? 1500;

  while (now() - started < input.timeoutMs) {
    const response = await fetchImpl(
      `${CURSOR_AGENTS_URL}/${encodeURIComponent(input.agentId)}`,
      {
        headers: {
          Authorization: cursorAuthHeader(input.cursorApiKey),
          'Content-Type': 'application/json',
        },
      }
    );
    const raw = await response.text();
    let body: {
      status?: string;
      target?: { prUrl?: string; url?: string };
    } = {};
    try {
      body = raw ? (JSON.parse(raw) as typeof body) : {};
    } catch {
      body = {};
    }

    const statusRaw = (body.status ?? 'running').toLowerCase();
    let status: CursorRecoveryStatus = 'running';
    if (statusRaw.includes('complete') || statusRaw === 'finished') {
      status = 'completed';
    } else if (statusRaw.includes('fail') || statusRaw.includes('error')) {
      status = 'failed';
    } else if (statusRaw.includes('cancel')) {
      status = 'cancelled';
    } else if (statusRaw === 'creating' || statusRaw === 'queued') {
      status = 'accepted';
    }

    if (status !== 'running' && status !== 'accepted') {
      const artifactUrl = body.target?.prUrl ?? body.target?.url;
      return {
        schema: 'jovie.summer.cursor-recovery/v1',
        adapterVersion: CURSOR_RECOVERY_ADAPTER_VERSION,
        jobId: input.jobId,
        routeId: input.routeId,
        agentId: input.agentId,
        runId: input.runId,
        status,
        ...(artifactUrl ? { artifactUrl } : {}),
        remainingHumanDecision:
          status === 'completed'
            ? 'Review prepared patch and approve delivery/runtime install if still required'
            : 'Inspect failed recovery run and decide whether to re-admit or escalate',
        observedAt: new Date(now()).toISOString(),
      };
    }

    await sleep(pollIntervalMs);
  }

  return {
    schema: 'jovie.summer.cursor-recovery/v1',
    adapterVersion: CURSOR_RECOVERY_ADAPTER_VERSION,
    jobId: input.jobId,
    routeId: input.routeId,
    agentId: input.agentId,
    runId: input.runId,
    status: 'timed_out',
    remainingHumanDecision:
      'Recovery run timed out — cancel or extend bound, then reconcile',
    observedAt: new Date(now()).toISOString(),
  };
}

/**
 * End-to-end governed recovery: admit → route → launch → reconcile.
 * Launch without reconcile is intentionally not exposed as success.
 */
export async function requestCursorIsolatedRecovery(input: {
  readonly job: ExecutionJob;
  readonly context: RecoveryAdmissionContext;
  readonly cursorApiKey: string;
  readonly repository: string;
  readonly ref?: string;
  readonly timeoutMs: number;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}): Promise<{
  readonly route: RouteReceipt;
  readonly launch: CursorLaunchAcceptance;
  readonly receipt: CursorRecoveryReceipt;
}> {
  const route = routeIsolatedRecoveryJob(input.job, input.context);
  const launch = await launchCursorRecoveryAgent({
    cursorApiKey: input.cursorApiKey,
    prompt: [
      input.job.objective,
      'Constraints: isolated diagnostics and PR preparation only.',
      'Do not mutate live services. Do not take over uncertain active jobs.',
      `Evidence: ${input.job.evidenceRefs.join(', ')}`,
    ].join('\n'),
    repository: input.repository,
    ref: input.ref,
    fetchImpl: input.fetchImpl,
  });
  const receipt = await reconcileCursorRecoveryRun({
    cursorApiKey: input.cursorApiKey,
    agentId: launch.agentId,
    runId: launch.runId,
    jobId: input.job.id,
    routeId: route.selectedRoute.id,
    timeoutMs: input.timeoutMs,
    fetchImpl: input.fetchImpl,
    now: input.now,
    sleep: input.sleep,
  });
  return { route, launch, receipt };
}

/** Durable E4 Gem-dark exercise report — remaining human decision only. */
export function buildGemDarkExerciseReport(input: {
  readonly disposition: RecoveryDisposition;
  readonly recoveryReceipt?: CursorRecoveryReceipt;
  readonly observedAt?: string;
}): {
  readonly schema: 'jovie.summer.gem-dark-exercise/v1';
  readonly isolatedRecoveryAdmitted: boolean;
  readonly uncertainLiveJobDuplicated: false;
  readonly permissionSelfExpansionDenied: boolean;
  readonly gemDependentLiveMutationHeld: boolean;
  readonly namedGap?: string;
  readonly remainingHumanDecision: string;
  readonly observedAt: string;
} {
  const d = input.disposition;
  const remainingHumanDecision =
    d.status === 'hold'
      ? d.remainingHumanDecision
      : (input.recoveryReceipt?.remainingHumanDecision ??
        (d.status === 'deny'
          ? `Blocked (${d.code}) — human must authorize an alternate or restore Gem`
          : 'Review isolated recovery artifact and approve any runtime install still required'));

  return {
    schema: 'jovie.summer.gem-dark-exercise/v1',
    isolatedRecoveryAdmitted: d.status === 'admit',
    uncertainLiveJobDuplicated: false,
    permissionSelfExpansionDenied:
      d.status === 'deny' && d.code === 'permission-self-expansion',
    gemDependentLiveMutationHeld:
      d.status === 'hold' &&
      d.namedGap === 'gem-dependent-live-mutation-requires-gem',
    ...(d.status === 'hold' ? { namedGap: d.namedGap } : {}),
    remainingHumanDecision,
    observedAt: input.observedAt ?? new Date().toISOString(),
  };
}
