import type { AcquisitionEligibilityReport } from '@/lib/acquisition/eligibility.server';
import type { FounderFunnelData } from '@/lib/admin/founder-funnel';
import type { WaitlistMetrics } from '@/lib/admin/waitlist';
import type { SummerFunnelResponse } from '@/lib/analytics/signup-funnel.server';
import type { ShippingStateProjection } from '@/lib/ovie/shipping-state';

export const COMPANY_STATE_SCHEMA = 'jovie.summer-company-state/v1' as const;
export const REVENUE_CONE_STEPS = [
  'public_profile',
  'homepage_entry',
  'onboarding_auth_claim',
  'checkout_payment_entitlement',
  'activation_dashboard',
] as const;
export const COMPANY_FUNNEL_STEPS = [
  'visits',
  'eligible_entries',
  'onboarding_starts',
  'account_creation',
  'claim_shown',
  'claim_attempted',
  'claim_completed',
  'checkout_shown',
  'checkout_started',
  'paid',
  'activated',
] as const;

export type CompanyEvidenceStatus = 'green' | 'red' | 'unknown';
export type RevenueConeStep = (typeof REVENUE_CONE_STEPS)[number];
export type CompanyFunnelStep = (typeof COMPANY_FUNNEL_STEPS)[number];
export type UnknownCause =
  | 'analytics_event_loss'
  | 'failed_persistence'
  | 'failed_reader'
  | 'failed_scheduler'
  | 'missing_instrumentation'
  | 'product_failure'
  | 'stale_evidence';

export interface CompanyMetric<T> {
  readonly value: T | null;
  readonly status: CompanyEvidenceStatus;
  readonly observedAt: string | null;
  readonly source: string;
  readonly sourceRevision: string | null;
  readonly sourceWindow: string;
  readonly freshnessBudgetMs: number;
  readonly semantics: 'estimated' | 'exact';
  readonly confidence: 'high' | 'medium' | 'low' | 'none';
}

export interface CompanyInvestigation {
  readonly id: string;
  readonly cause: UnknownCause;
  readonly owner: string;
  readonly nextAction: string;
  readonly expectedBy: string;
  readonly firstObservedAt: string;
  readonly lastObservedAt: string;
  readonly evidenceFingerprint: string;
  readonly attempts: number;
  readonly state: 'investigating' | 'recovering';
  readonly founderEscalation: false;
}

export interface CompanyStateSnapshot {
  readonly schema: typeof COMPANY_STATE_SCHEMA;
  readonly revision: string;
  readonly generatedAt: string;
  readonly shipping: {
    readonly rollingRatePerDay: CompanyMetric<number>;
    readonly dailyBuckets: CompanyMetric<
      readonly { readonly day: string; readonly shipped: number }[]
    >;
    readonly trend: CompanyMetric<'down' | 'flat' | 'up'>;
    readonly queueHealth: CompanyMetric<{
      readonly admitted: number;
      readonly blocked: number;
      readonly queued: number;
    }>;
  };
  readonly linear: {
    readonly activeConstraint: CompanyMetric<string>;
    readonly p0s: CompanyMetric<number>;
    readonly blocked: CompanyMetric<number>;
    readonly inProgress: CompanyMetric<number>;
    readonly admitted: CompanyMetric<number>;
    readonly meaningfulDelta: CompanyMetric<number>;
  };
  readonly certification: Readonly<
    Record<RevenueConeStep, CompanyMetric<CompanyEvidenceStatus>>
  >;
  readonly funnel: Readonly<Record<CompanyFunnelStep, CompanyMetric<number>>>;
  readonly waitlist: {
    readonly total: CompanyMetric<number>;
    readonly signedUp: CompanyMetric<number>;
    readonly conversion: CompanyMetric<number>;
    readonly dropOff: CompanyMetric<number>;
  };
  readonly producerHealth: {
    readonly acquisitionEligibility: CompanyMetric<'alive'>;
    readonly pipelineScoreboard: CompanyMetric<'alive'>;
  };
  readonly sync: readonly {
    readonly provider: 'github' | 'linear' | 'product';
    readonly purpose: string;
    readonly mode: 'event' | 'incremental' | 'reconcile';
    readonly cursor: string | null;
    readonly batchSize: number;
    readonly calls: number;
    readonly avoidedCalls: number;
    readonly rateLimitHeadroom: number | null;
    readonly fallback: string;
  }[];
  readonly activeConstraint: string | null;
  readonly firstBlockingEvidence: string | null;
  readonly investigations: readonly CompanyInvestigation[];
  readonly sourcePayloads: {
    readonly acquisitionEligibility: AcquisitionEligibilityReport;
    readonly signupFunnel: SummerFunnelResponse;
  };
}

export interface BuildCompanyStateInput {
  readonly now: Date;
  readonly revision: string;
  readonly acquisitionEligibility: AcquisitionEligibilityReport;
  readonly signupFunnel: SummerFunnelResponse;
  readonly founderFunnel: FounderFunnelData;
  readonly waitlist: WaitlistMetrics;
  readonly shippingProjection?: ShippingStateProjection | null;
  readonly linearIssues?:
    | readonly {
        readonly identifier: string | null;
        readonly priority: number | null;
        readonly state: {
          readonly name: string | null;
          readonly type: string | null;
        };
        readonly updatedAt: string | null;
      }[]
    | null;
  readonly linearObservedAt?: string | null;
  readonly previous?: CompanyStateSnapshot | null;
}

const PRODUCT_FRESHNESS_MS = 30 * 60_000;

export function companyMetric<T>(input: {
  readonly value: T | null;
  readonly status?: CompanyEvidenceStatus;
  readonly observedAt: string | null;
  readonly source: string;
  readonly sourceRevision: string | null;
  readonly sourceWindow: string;
  readonly freshnessBudgetMs: number;
  readonly semantics?: 'estimated' | 'exact';
  readonly confidence?: 'high' | 'medium' | 'low' | 'none';
}): CompanyMetric<T> {
  return {
    value: input.value,
    status: input.status ?? (input.value === null ? 'unknown' : 'green'),
    observedAt: input.observedAt,
    source: input.source,
    sourceRevision: input.sourceRevision,
    sourceWindow: input.sourceWindow,
    freshnessBudgetMs: input.freshnessBudgetMs,
    semantics: input.semantics ?? 'exact',
    confidence: input.confidence ?? (input.value === null ? 'none' : 'high'),
  };
}

export function effectiveCompanyMetricStatus(
  metric: CompanyMetric<unknown>,
  now: Date
): CompanyEvidenceStatus {
  if (metric.status !== 'green') return metric.status;
  if (!metric.observedAt) return 'unknown';
  const observed = Date.parse(metric.observedAt);
  const age = now.getTime() - observed;
  return Number.isFinite(observed) &&
    age >= 0 &&
    age <= metric.freshnessBudgetMs
    ? 'green'
    : 'unknown';
}

function countStep(report: SummerFunnelResponse, step: string): number | null {
  const funnel = report.windows['7d'].funnels.find(
    item => item.funnelId === 'artist_signup'
  );
  return funnel?.steps.find(item => item.step === step)?.count ?? null;
}

function founderCount(report: FounderFunnelData, key: string): number | null {
  return report.errors.length > 0
    ? null
    : (report.stages.find(stage => stage.key === key)?.count ?? null);
}

function requirementStatus(
  report: AcquisitionEligibilityReport,
  ids: readonly string[]
): CompanyEvidenceStatus {
  const statuses = report.requirements
    .filter(item => ids.includes(item.id))
    .map(item => item.status);
  if (statuses.length !== ids.length || statuses.includes('unknown'))
    return 'unknown';
  return statuses.includes('red') ? 'red' : 'green';
}

function bindingEvidence(
  report: AcquisitionEligibilityReport,
  ids: readonly string[]
): { maxAgeMs: number; observedAt: string | null } | null {
  let tightest: { maxAgeMs: number; observedAt: string | null } | null = null;
  for (const requirement of report.requirements) {
    if (!ids.includes(requirement.id)) continue;
    for (const item of requirement.evidence) {
      if (!item.observedAt) continue;
      const expiry = Date.parse(item.observedAt) + item.maxAgeMs;
      const best =
        tightest?.observedAt === null || tightest === null
          ? Number.POSITIVE_INFINITY
          : Date.parse(tightest.observedAt) + tightest.maxAgeMs;
      if (expiry < best) tightest = item;
    }
  }
  return tightest;
}

function metricFingerprint(metric: CompanyMetric<unknown>): string {
  return [
    metric.source,
    metric.sourceRevision ?? 'none',
    metric.observedAt ?? 'never',
    metric.status,
    JSON.stringify(metric.value),
  ].join(':');
}

function investigationFor(
  id: string,
  metric: CompanyMetric<unknown>,
  now: Date,
  previous: readonly CompanyInvestigation[],
  cause?: UnknownCause
): CompanyInvestigation {
  const fingerprint = metricFingerprint(metric);
  const prior = previous.find(item => item.id === id);
  const stale =
    metric.observedAt !== null &&
    now.getTime() - Date.parse(metric.observedAt) > metric.freshnessBudgetMs;
  const selectedCause =
    cause ??
    (stale
      ? 'stale_evidence'
      : metric.status === 'red'
        ? 'product_failure'
        : metric.value === null || metric.status === 'unknown'
          ? 'missing_instrumentation'
          : 'failed_reader');
  const action =
    selectedCause === 'stale_evidence'
      ? `Rerun the existing ${metric.source} producer and verify its persisted receipt.`
      : selectedCause === 'product_failure'
        ? `Trace the affected cohort through ${metric.source}; separate abandonment, UI, technical, identity, eligibility, and event loss.`
        : `Repair the existing ${metric.source} detector or reader and persist a source-bound receipt.`;
  return {
    id,
    cause: selectedCause,
    owner: metric.source,
    nextAction: action,
    expectedBy: new Date(
      now.getTime() + metric.freshnessBudgetMs
    ).toISOString(),
    firstObservedAt: prior?.firstObservedAt ?? now.toISOString(),
    lastObservedAt: now.toISOString(),
    evidenceFingerprint: fingerprint,
    attempts:
      prior && prior.evidenceFingerprint === fingerprint
        ? prior.attempts
        : (prior?.attempts ?? 0) + 1,
    state: 'recovering',
    founderEscalation: false,
  };
}

function findConstraint(
  certification: CompanyStateSnapshot['certification'],
  funnel: CompanyStateSnapshot['funnel'],
  now: Date
): { readonly id: string | null; readonly cause?: UnknownCause } {
  for (const step of REVENUE_CONE_STEPS) {
    if (effectiveCompanyMetricStatus(certification[step], now) !== 'green') {
      return { id: `certification:${step}` };
    }
  }
  let missing: { readonly id: string; readonly cause: UnknownCause } | null =
    null;
  let lastMeasured: number | null = null;
  for (const step of COMPANY_FUNNEL_STEPS) {
    const current = funnel[step];
    if (current.value === null) {
      missing ??= {
        id: `funnel:${step}`,
        cause: 'missing_instrumentation',
      };
      continue;
    }
    if (lastMeasured !== null && lastMeasured > 0 && current.value === 0) {
      return { id: `funnel:${step}`, cause: 'product_failure' };
    }
    lastMeasured = current.value;
  }
  return missing ?? { id: null };
}

function constraintInvestigations(
  snapshot: Pick<
    CompanyStateSnapshot,
    'certification' | 'funnel' | 'investigations' | 'producerHealth'
  >,
  now: Date
): {
  readonly activeConstraint: string | null;
  readonly investigations: CompanyInvestigation[];
} {
  const constraint = findConstraint(
    snapshot.certification,
    snapshot.funnel,
    now
  );
  const metricForConstraint = constraint.id?.startsWith('certification:')
    ? snapshot.certification[
        constraint.id.slice('certification:'.length) as RevenueConeStep
      ]
    : constraint.id?.startsWith('funnel:')
      ? snapshot.funnel[
          constraint.id.slice('funnel:'.length) as CompanyFunnelStep
        ]
      : null;
  const investigations =
    metricForConstraint && constraint.id
      ? [
          investigationFor(
            constraint.id,
            metricForConstraint,
            now,
            snapshot.investigations,
            constraint.cause
          ),
        ]
      : [];
  if (
    effectiveCompanyMetricStatus(
      snapshot.producerHealth.pipelineScoreboard,
      now
    ) !== 'green'
  ) {
    investigations.push(
      investigationFor(
        'producer:JOV-3748',
        snapshot.producerHealth.pipelineScoreboard,
        now,
        snapshot.investigations
      )
    );
  }
  return { activeConstraint: constraint.id, investigations };
}

export function interpretCompanyState(
  snapshot: CompanyStateSnapshot,
  now: Date
): CompanyStateSnapshot {
  const interpreted = constraintInvestigations(snapshot, now);
  return {
    ...snapshot,
    activeConstraint: interpreted.activeConstraint,
    firstBlockingEvidence: interpreted.activeConstraint,
    investigations: interpreted.investigations,
  };
}

function emptyExecutionMetric<T>(source: string): CompanyMetric<T> {
  return companyMetric<T>({
    value: null,
    observedAt: null,
    source,
    sourceRevision: null,
    sourceWindow: 'rolling-7d',
    freshnessBudgetMs: PRODUCT_FRESHNESS_MS,
  });
}

function executionState(
  projection: ShippingStateProjection | null | undefined,
  linearIssues: BuildCompanyStateInput['linearIssues'],
  linearObservedAt: string | null | undefined,
  previous: CompanyStateSnapshot | null | undefined
): Pick<
  CompanyStateSnapshot,
  'linear' | 'producerHealth' | 'shipping' | 'sync'
> {
  const observedAt = projection?.observationTimestamp ?? null;
  const revision = projection?.sourceRevision ?? null;
  const mergeCount = projection?.delivery.merges.last7Days.value ?? null;
  const priorMergeCount = projection?.delivery.merges.prior7Days.value ?? null;
  const today = projection?.delivery.merges.today.value ?? null;
  const usableShipping =
    projection && projection.state !== 'unavailable' && mergeCount !== null;
  const previousBuckets = previous?.shipping.dailyBuckets.value ?? [];
  const day = projection?.delivery.merges.since?.slice(0, 10) ?? null;
  const dailyBuckets =
    usableShipping && day && today !== null
      ? [
          ...previousBuckets.filter(item => item.day !== day),
          { day, shipped: today },
        ]
          .sort((left, right) => left.day.localeCompare(right.day))
          .slice(-14)
      : previousBuckets;
  const shippingMetric = <T>(
    value: T,
    window: string,
    semantics: 'estimated' | 'exact' = 'exact'
  ) =>
    companyMetric({
      value,
      observedAt,
      source: 'shipping-state',
      sourceRevision: revision,
      sourceWindow: window,
      freshnessBudgetMs: 2 * 60 * 60_000,
      semantics,
      confidence: semantics === 'exact' ? 'high' : 'medium',
    });
  const tasks = projection?.operationalTasks.tasks ?? [];
  const activeIssues = (linearIssues ?? []).filter(issue =>
    ['triage', 'backlog', 'unstarted', 'started'].includes(
      issue.state.type ?? ''
    )
  );
  const blocked = activeIssues.filter(issue =>
    issue.state.name?.toLowerCase().includes('block')
  );
  const inProgress = activeIssues.filter(
    issue => issue.state.type === 'started'
  );
  const previousLinearCursor = previous?.sync.find(
    item => item.provider === 'linear'
  )?.cursor;
  const meaningfulDelta = previousLinearCursor
    ? activeIssues.filter(
        issue => issue.updatedAt && issue.updatedAt > previousLinearCursor
      ).length
    : activeIssues.length;
  const linearMetric = <T>(
    value: T,
    semantics: 'estimated' | 'exact' = 'estimated'
  ) =>
    companyMetric({
      value,
      observedAt: linearObservedAt ?? null,
      source: 'linear-active-issues-batch',
      sourceRevision: linearObservedAt ?? null,
      sourceWindow: 'incremental-current',
      freshnessBudgetMs: 2 * 60 * 60_000,
      semantics,
      confidence: semantics === 'exact' ? 'high' : 'medium',
    });
  const shipping = usableShipping
    ? {
        rollingRatePerDay: shippingMetric(mergeCount / 7, 'rolling-7d'),
        dailyBuckets: shippingMetric(dailyBuckets, 'daily-14d'),
        trend: shippingMetric(
          priorMergeCount === null || mergeCount === priorMergeCount
            ? ('flat' as const)
            : mergeCount > priorMergeCount
              ? ('up' as const)
              : ('down' as const),
          'rolling-7d-v-prior-7d'
        ),
        queueHealth: shippingMetric(
          {
            admitted: tasks.length,
            blocked: tasks.filter(task => task.workflowState === 'blocked')
              .length,
            queued:
              projection.delivery.mergeQueueDepth.value ??
              tasks.filter(task => task.workflowState === 'queued').length,
          },
          'current',
          'estimated'
        ),
      }
    : (previous?.shipping ??
      ({
        rollingRatePerDay: emptyExecutionMetric('pipeline-scoreboard'),
        dailyBuckets: emptyExecutionMetric('pipeline-scoreboard'),
        trend: emptyExecutionMetric('pipeline-scoreboard'),
        queueHealth: emptyExecutionMetric('pipeline-scoreboard'),
      } as CompanyStateSnapshot['shipping']));
  const linear = linearIssues
    ? {
        activeConstraint: linearMetric(
          activeIssues.find(issue => issue.priority === 1)?.identifier ??
            blocked[0]?.identifier ??
            inProgress[0]?.identifier ??
            'none'
        ),
        p0s: linearMetric(
          activeIssues.filter(issue => issue.priority === 1).length
        ),
        blocked: linearMetric(blocked.length),
        inProgress: linearMetric(inProgress.length),
        admitted: linearMetric(inProgress.length),
        meaningfulDelta: linearMetric(meaningfulDelta),
      }
    : (previous?.linear ??
      ({
        activeConstraint: emptyExecutionMetric('linear-incremental-sync'),
        p0s: emptyExecutionMetric('linear-incremental-sync'),
        blocked: emptyExecutionMetric('linear-incremental-sync'),
        inProgress: emptyExecutionMetric('linear-incremental-sync'),
        admitted: emptyExecutionMetric('linear-incremental-sync'),
        meaningfulDelta: emptyExecutionMetric('linear-incremental-sync'),
      } as CompanyStateSnapshot['linear']));
  const pipelineScoreboard = usableShipping
    ? companyMetric({
        value: 'alive' as const,
        observedAt,
        source: 'JOV-3748:shipping-state',
        sourceRevision: revision,
        sourceWindow: 'rolling-7d',
        freshnessBudgetMs: 2 * 60 * 60_000,
      })
    : (previous?.producerHealth.pipelineScoreboard ??
      emptyExecutionMetric<'alive'>('JOV-3748:pipeline-scoreboard'));
  const sync = [
    ...(usableShipping
      ? [
          {
            provider: 'github' as const,
            purpose: 'shipping-throughput',
            mode: 'reconcile' as const,
            cursor: projection.cursor,
            batchSize: Object.keys(projection.sources).length,
            calls: Object.keys(projection.sources).length,
            avoidedCalls: 0,
            rateLimitHeadroom: null,
            fallback: 'cached-readers-with-backoff-then-last-snapshot',
          },
        ]
      : (previous?.sync.filter(item => item.provider === 'github') ?? [])),
    ...(linearIssues
      ? [
          {
            provider: 'linear' as const,
            purpose: 'execution-state',
            mode: 'reconcile' as const,
            cursor: linearObservedAt ?? null,
            batchSize: linearIssues.length,
            calls: 1,
            avoidedCalls: Math.max(0, linearIssues.length - 1),
            rateLimitHeadroom: null,
            fallback: 'retain-last-linear-batch-and-investigate',
          },
        ]
      : (previous?.sync.filter(item => item.provider === 'linear') ?? [])),
    {
      provider: 'product' as const,
      purpose: 'revenue-cone-funnel',
      mode: 'reconcile' as const,
      cursor: null,
      batchSize: 4,
      calls: 4,
      avoidedCalls: 0,
      rateLimitHeadroom: null,
      fallback: 'retain-last-snapshot-and-investigate',
    },
  ];
  return {
    shipping,
    linear,
    producerHealth: {
      acquisitionEligibility: emptyExecutionMetric('JOV-7696'),
      pipelineScoreboard,
    },
    sync,
  };
}

export function buildCompanyState(
  input: BuildCompanyStateInput
): CompanyStateSnapshot {
  const observedAt = input.signupFunnel.observedAt;
  const eligibilityObservedAt = input.acquisitionEligibility.evaluatedAt;
  const certificationMetric = (
    sourceIds: readonly string[]
  ): CompanyMetric<CompanyEvidenceStatus> => {
    const status = requirementStatus(input.acquisitionEligibility, sourceIds);
    const binding = bindingEvidence(input.acquisitionEligibility, sourceIds);
    return companyMetric({
      value: status,
      status,
      observedAt:
        binding?.observedAt ??
        (status === 'unknown' ? null : eligibilityObservedAt),
      source: 'acquisition-eligibility',
      sourceRevision: input.acquisitionEligibility.contract,
      sourceWindow: 'current-receipts',
      freshnessBudgetMs: binding?.maxAgeMs ?? PRODUCT_FRESHNESS_MS,
    });
  };
  const certification = {
    public_profile: certificationMetric(['profile_truth']),
    homepage_entry: certificationMetric(['entry']),
    onboarding_auth_claim: certificationMetric(['auth_signup', 'claim']),
    checkout_payment_entitlement: certificationMetric([
      'commerce_canary',
      'handoff_correlation',
      'jov6258_preflight',
      'offer_checkout',
      'payment_entitlement',
      'payment_journey',
      'reversal',
      'selected_rail',
    ]),
    activation_dashboard: certificationMetric(['activation']),
  } satisfies CompanyStateSnapshot['certification'];
  const productMetric = (value: number | null, source: string) =>
    companyMetric({
      value,
      observedAt,
      source,
      sourceRevision: input.signupFunnel.contractVersion,
      sourceWindow: 'rolling-7d',
      freshnessBudgetMs: PRODUCT_FRESHNESS_MS,
    });
  const signupCount = (step: string) =>
    productMetric(countStep(input.signupFunnel, step), 'signup-funnel');
  const founderMetric = (key: string) =>
    productMetric(founderCount(input.founderFunnel, key), 'founder-funnel');
  const funnel = {
    visits: signupCount('landing_view'),
    eligible_entries: signupCount('cta_click'),
    onboarding_starts: signupCount('onboarding_started'),
    account_creation: founderMetric('accounts_created'),
    claim_shown: productMetric(null, 'signup-funnel:claim-shown'),
    claim_attempted: productMetric(null, 'signup-funnel:claim-attempted'),
    claim_completed: signupCount('claim_complete'),
    checkout_shown: productMetric(null, 'billing-funnel:checkout-shown'),
    checkout_started: productMetric(null, 'billing-funnel:checkout-started'),
    paid: founderMetric('paid'),
    activated: founderMetric('onboarding_complete'),
  } satisfies CompanyStateSnapshot['funnel'];
  const previous = input.previous;
  const execution = executionState(
    input.shippingProjection,
    input.linearIssues,
    input.linearObservedAt,
    previous
  );
  const waitlistSource = 'waitlist-status-aggregate';
  const waitlistMetric = (value: number) =>
    companyMetric({
      value,
      observedAt: input.now.toISOString(),
      source: waitlistSource,
      sourceRevision: 'waitlist-status-v1',
      sourceWindow: 'current',
      freshnessBudgetMs: PRODUCT_FRESHNESS_MS,
    });
  const conversion =
    input.waitlist.total > 0
      ? input.waitlist.signedUp / input.waitlist.total
      : 0;
  const producerHealth = {
    acquisitionEligibility: companyMetric({
      value: 'alive' as const,
      observedAt: eligibilityObservedAt,
      source: 'JOV-7696:acquisition-eligibility',
      sourceRevision: input.acquisitionEligibility.contract,
      sourceWindow: 'current-receipts',
      freshnessBudgetMs: PRODUCT_FRESHNESS_MS,
    }),
    pipelineScoreboard: execution.producerHealth.pipelineScoreboard,
  };
  const interpreted = constraintInvestigations(
    {
      certification,
      funnel,
      producerHealth,
      investigations: previous?.investigations ?? [],
    },
    input.now
  );
  return {
    schema: COMPANY_STATE_SCHEMA,
    revision: input.revision,
    generatedAt: input.now.toISOString(),
    shipping: execution.shipping,
    linear: execution.linear,
    certification,
    funnel,
    waitlist: {
      total: waitlistMetric(input.waitlist.total),
      signedUp: waitlistMetric(input.waitlist.signedUp),
      conversion: waitlistMetric(conversion),
      dropOff: waitlistMetric(input.waitlist.total - input.waitlist.signedUp),
    },
    producerHealth,
    sync: execution.sync.map(item =>
      item.provider === 'product' ? { ...item, cursor: observedAt } : item
    ),
    activeConstraint: interpreted.activeConstraint,
    firstBlockingEvidence: interpreted.activeConstraint,
    investigations: interpreted.investigations,
    sourcePayloads: {
      acquisitionEligibility: input.acquisitionEligibility,
      signupFunnel: input.signupFunnel,
    },
  };
}

export function summarizeCompanyState(
  snapshot: CompanyStateSnapshot,
  now: Date
) {
  const throughput = snapshot.shipping.rollingRatePerDay;
  const stale = effectiveCompanyMetricStatus(throughput, now) !== 'green';
  return {
    generatedAt: snapshot.generatedAt,
    throughput: throughput.value,
    throughputSemantics: stale ? 'stale-estimate' : throughput.semantics,
    activeConstraint: snapshot.activeConstraint,
    funnel: Object.fromEntries(
      COMPANY_FUNNEL_STEPS.map(step => [step, snapshot.funnel[step].value])
    ),
    remediation: snapshot.investigations[0] ?? null,
  };
}
