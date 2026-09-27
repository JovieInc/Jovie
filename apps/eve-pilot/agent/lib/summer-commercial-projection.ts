import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u);
const metric = z
  .object({
    value: z.number().int().nonnegative().finite().max(Number.MAX_SAFE_INTEGER),
    sourceId: id,
  })
  .strict()
  .nullable();
const signedMetric = metric
  .unwrap()
  .extend({
    value: z
      .number()
      .int()
      .min(-Number.MAX_SAFE_INTEGER)
      .max(Number.MAX_SAFE_INTEGER),
  })
  .nullable();
const source = z
  .object({
    id,
    reference: z.string().url().max(2048),
    revision: z.string().min(1).max(128),
    observedAt: z.string().datetime({ offset: true }),
    basis: z.enum(['observed', 'hypothesis']),
  })
  .strict();
const objectiveClass = z.enum([
  'direct',
  'unblocker',
  'risk-invariant',
  'compounding',
]);
const funnelStage = z.enum([
  'prospects',
  'conversations',
  'activated',
  'paid',
  'retained',
  'mrr',
]);
const candidate = z
  .object({
    id,
    product: z.enum([
      'jovie-thumbnails',
      'jovie-profiles',
      'logyourbody',
      'shared',
    ]),
    kind: z.enum([
      'commercial',
      'infrastructure',
      'paid-rescue',
      'control-recovery',
    ]),
    objectiveClass,
    causalPath: z.string().trim().min(1).max(500),
    targetFunnelStage: funnelStage.nullable(),
    boundedInvariant: z.string().trim().min(1).max(500).nullable(),
    stopShip: z.boolean(),
    expectedObjectiveImpact: metric,
    agentMinutes: metric,
    ciMinutes: metric,
    safetyCleared: z.boolean(),
    held: z.boolean(),
    noAuto: z.boolean(),
    consentCleared: z.boolean(),
    readinessCleared: z.boolean(),
    lybCanaryPassed: z.boolean(),
    gateSourceId: id,
    paidValueCompletions: metric,
    collectedCashCents: metric,
    contributionMarginCents: signedMetric,
    additionalFounderMinutesPerDay: metric,
    daysToCash: metric,
    incrementalSpendCents: metric,
    repeatedUsefulJobs: metric,
    founderMinutesSaved: metric,
    usefulJobsPerWeekGain: metric.default(null),
    reliabilityBasisPointsGain: metric.default(null),
    reusedProductCount: metric.default(null),
    implementationCostCents: metric,
    ongoingCostCents: metric,
    daysToBenefit: metric,
  })
  .strict();

/** A complete producer-reported snapshot, never an additive revenue event. */
export const summerCommercialSnapshotSchema = z
  .object({
    schema: z.literal('jovie.summer-commercial.snapshot/v2'),
    objective: z
      .object({
        issue: z.literal('JOV-6065'),
        product: z.literal('logyourbody'),
        outcome: z.literal('shipped-and-5000-usd-mrr'),
        targetRecurringMrrCents: z.literal(500000),
        deadline: z.literal('2026-10-05'),
        revision: z.string().min(1).max(128),
      })
      .strict(),
    bottleneck: z
      .object({
        stage: funnelStage,
        sourceId: id,
      })
      .strict(),
    funnel: z
      .object({
        prospects: metric,
        conversations: metric,
        activated: metric,
        paid: metric,
        retained: metric,
        mrrCents: metric,
      })
      .strict(),
    capacity: z
      .object({
        agentMinutesPerDay: metric,
        ciMinutesPerDay: metric,
        founderMinutesPerDay: metric,
        availableCashCents: signedMetric,
      })
      .strict(),
    sources: z.array(source).max(64),
    candidates: z.array(candidate).max(16),
    activeCommercialId: id.nullable(),
    recurringMrrCents: metric,
    collectedCashCents: metric,
    committedOperatingCostCents: metric,
    employerCompensationCostCents: metric,
    availableCashAfterObligationsCents: signedMetric,
    recordedFounderMinutesPerDay: metric,
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    for (const key of ['sources', 'candidates'] as const) {
      if (
        new Set(snapshot[key].map(item => item.id)).size !==
        snapshot[key].length
      ) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate ${key} id`,
          path: [key],
        });
      }
    }
    snapshot.candidates.forEach((item, index) => {
      if (item.objectiveClass === 'risk-invariant' && !item.boundedInvariant) {
        ctx.addIssue({
          code: 'custom',
          message: 'risk-invariant work requires a bounded invariant',
          path: ['candidates', index, 'boundedInvariant'],
        });
      }
      if (item.objectiveClass !== 'risk-invariant' && item.boundedInvariant) {
        ctx.addIssue({
          code: 'custom',
          message: 'only risk-invariant work may claim a bounded invariant',
          path: ['candidates', index, 'boundedInvariant'],
        });
      }
      if (item.objectiveClass === 'direct' && !item.targetFunnelStage) {
        ctx.addIssue({
          code: 'custom',
          message: 'direct work requires a target funnel stage',
          path: ['candidates', index, 'targetFunnelStage'],
        });
      }
    });
  });

export type CommercialSnapshot = z.infer<typeof summerCommercialSnapshotSchema>;
type Candidate = CommercialSnapshot['candidates'][number];
type Metric = z.infer<typeof metric>;
const MAX_SOURCE_AGE_MS = 24 * 60 * 60 * 1000;

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function projectSummerCommercial(input: unknown, now: Date) {
  const snapshot = summerCommercialSnapshotSchema.parse(input);
  const unknowns = new Set<string>();
  const sources = new Map(snapshot.sources.map(item => [item.id, item]));
  function sourceUsable(sourceId: string) {
    const item = sources.get(sourceId);
    if (!item) return false;
    const age = now.getTime() - Date.parse(item.observedAt);
    return item.basis === 'observed' && age >= 0 && age <= MAX_SOURCE_AGE_MS;
  }
  function value(item: Metric, label: string): number | null {
    if (!item || !sourceUsable(item.sourceId)) {
      unknowns.add(label);
      return null;
    }
    return item.value;
  }
  const financials = Object.fromEntries(
    (
      [
        'recurringMrrCents',
        'collectedCashCents',
        'committedOperatingCostCents',
        'employerCompensationCostCents',
        'availableCashAfterObligationsCents',
        'recordedFounderMinutesPerDay',
      ] as const
    ).map(key => [key, value(snapshot[key], key) ?? 'UNKNOWN'])
  );
  const bottleneckSourceUsable = sourceUsable(snapshot.bottleneck.sourceId);
  if (!bottleneckSourceUsable) unknowns.add('bottleneck:evidence_required');
  const funnel = Object.fromEntries(
    Object.entries(snapshot.funnel).map(([key, item]) => [
      key,
      value(item, `funnel:${key}`) ?? 'UNKNOWN',
    ])
  );
  const capacity = Object.fromEntries(
    Object.entries(snapshot.capacity).map(([key, item]) => [
      key,
      value(item, `capacity:${key}`) ?? 'UNKNOWN',
    ])
  );
  const eligible = snapshot.candidates.filter(item => {
    const gates =
      sourceUsable(item.gateSourceId) &&
      item.safetyCleared &&
      !item.held &&
      !item.noAuto &&
      item.consentCleared &&
      item.readinessCleared &&
      bottleneckSourceUsable &&
      (item.product !== 'logyourbody' || item.lybCanaryPassed);
    if (!gates) unknowns.add(`${item.id}:gate_not_cleared`);
    return gates;
  });
  const read = (
    item: Candidate,
    key: Exclude<
      keyof Candidate,
      | 'id'
      | 'product'
      | 'kind'
      | 'objectiveClass'
      | 'causalPath'
      | 'targetFunnelStage'
      | 'boundedInvariant'
      | 'stopShip'
      | 'safetyCleared'
      | 'held'
      | 'noAuto'
      | 'consentCleared'
      | 'readinessCleared'
      | 'lybCanaryPassed'
      | 'gateSourceId'
    >
  ) => value(item[key], `${item.id}:${key}`);
  const protectedWork = eligible.filter(
    item =>
      item.kind === 'paid-rescue' ||
      item.kind === 'control-recovery' ||
      (item.objectiveClass === 'risk-invariant' && item.stopShip)
  );
  protectedWork.sort(
    (a, b) =>
      Number(b.kind === 'paid-rescue') - Number(a.kind === 'paid-rescue') ||
      a.id.localeCompare(b.id)
  );
  const objectiveWork = eligible.filter(
    item =>
      item.product === snapshot.objective.product &&
      (item.objectiveClass === 'direct' ||
        item.objectiveClass === 'unblocker') &&
      (item.targetFunnelStage === null ||
        item.targetFunnelStage === snapshot.bottleneck.stage)
  );
  const commercialPool = objectiveWork.length
    ? objectiveWork
    : eligible.filter(item => item.objectiveClass === 'compounding');
  const boundedExperiments = commercialPool
    .filter(item => item.kind === 'commercial')
    .filter(item => {
      const minutes = read(item, 'additionalFounderMinutesPerDay');
      const spend = read(item, 'incrementalSpendCents');
      const impact = read(item, 'expectedObjectiveImpact');
      const agent = read(item, 'agentMinutes');
      const ci = read(item, 'ciMinutes');
      const recorded = financials.recordedFounderMinutesPerDay;
      return (
        minutes !== null &&
        spend === 0 &&
        impact !== null &&
        impact > 0 &&
        agent !== null &&
        ci !== null &&
        typeof recorded === 'number' &&
        typeof capacity.agentMinutesPerDay === 'number' &&
        typeof capacity.ciMinutesPerDay === 'number' &&
        typeof capacity.founderMinutesPerDay === 'number' &&
        typeof capacity.availableCashCents === 'number' &&
        agent <= capacity.agentMinutesPerDay &&
        ci <= capacity.ciMinutesPerDay &&
        spend <= capacity.availableCashCents &&
        minutes + recorded <= capacity.founderMinutesPerDay
      );
    });
  const commercial = boundedExperiments.flatMap(item => {
    const paid = read(item, 'paidValueCompletions');
    const cash = read(item, 'collectedCashCents');
    const margin = read(item, 'contributionMarginCents');
    const minutes = read(item, 'additionalFounderMinutesPerDay');
    const days = read(item, 'daysToCash');
    const impact = read(item, 'expectedObjectiveImpact');
    const agent = read(item, 'agentMinutes');
    const ci = read(item, 'ciMinutes');
    const spend = read(item, 'incrementalSpendCents');
    const recorded = financials.recordedFounderMinutesPerDay;
    if (
      paid === null ||
      cash === null ||
      margin === null ||
      minutes === null ||
      days === null ||
      impact === null ||
      agent === null ||
      ci === null ||
      spend === null ||
      typeof recorded !== 'number' ||
      typeof capacity.agentMinutesPerDay !== 'number' ||
      typeof capacity.ciMinutesPerDay !== 'number' ||
      typeof capacity.founderMinutesPerDay !== 'number' ||
      typeof capacity.availableCashCents !== 'number' ||
      minutes + recorded > capacity.founderMinutesPerDay ||
      agent > capacity.agentMinutesPerDay ||
      ci > capacity.ciMinutesPerDay ||
      spend > capacity.availableCashCents ||
      impact <= 0 ||
      paid < 1 ||
      cash <= 0 ||
      margin <= 0
    )
      return [];
    return [
      { item, paid, cash, margin, minutes, days, impact, agent, ci, spend },
    ];
  });
  // Use Pareto dominance, not invented ROI weights or a permanent product order.
  const frontier = commercial.filter(
    a =>
      !commercial.some(
        b =>
          b !== a &&
          b.paid >= a.paid &&
          b.cash >= a.cash &&
          b.margin >= a.margin &&
          b.impact >= a.impact &&
          b.agent <= a.agent &&
          b.ci <= a.ci &&
          b.spend <= a.spend &&
          b.minutes <= a.minutes &&
          b.days <= a.days &&
          (b.paid > a.paid ||
            b.cash > a.cash ||
            b.margin > a.margin ||
            b.impact > a.impact ||
            b.agent < a.agent ||
            b.ci < a.ci ||
            b.spend < a.spend ||
            b.minutes < a.minutes ||
            b.days < a.days)
      )
  );
  const active = boundedExperiments.find(
    item => item.id === snapshot.activeCommercialId
  );
  const evidenceCandidate =
    boundedExperiments.length === 1 ? boundedExperiments[0] : null;
  const selected =
    protectedWork[0]?.id ??
    active?.id ??
    (frontier.length === 1
      ? frontier[0].item.id
      : (evidenceCandidate?.id ?? null));
  if (snapshot.activeCommercialId && !active) {
    unknowns.add('active_experiment_requires_review_before_replacement');
  }
  const infrastructure = eligible
    .filter(item => item.kind === 'infrastructure')
    .filter(item => {
      const jobs = read(item, 'repeatedUsefulJobs');
      const saved = read(item, 'founderMinutesSaved');
      const build = read(item, 'implementationCostCents');
      const ongoing = read(item, 'ongoingCostCents');
      const days = read(item, 'daysToBenefit');
      return (
        jobs !== null &&
        jobs >= 2 &&
        saved !== null &&
        saved > 0 &&
        build !== null &&
        ongoing !== null &&
        days !== null
      );
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const boundedInfrastructure = infrastructure.filter(item => {
    const minutes = read(item, 'additionalFounderMinutesPerDay');
    const recorded = financials.recordedFounderMinutesPerDay;
    return (
      read(item, 'incrementalSpendCents') === 0 &&
      read(item, 'implementationCostCents') === 0 &&
      read(item, 'ongoingCostCents') === 0 &&
      minutes !== null &&
      typeof recorded === 'number' &&
      typeof capacity.founderMinutesPerDay === 'number' &&
      minutes + recorded <= capacity.founderMinutesPerDay
    );
  });
  const selection =
    (!protectedWork.length && snapshot.activeCommercialId && !active
      ? null
      : selected) ??
    (boundedInfrastructure.length === 1 ? boundedInfrastructure[0].id : null);
  if (!selection)
    unknowns.add('bounded_paid_value_or_tradeoff_evidence_required');
  return {
    schema: 'jovie.summer-commercial.projection/v2' as const,
    policyRevision: 'lyb-5000-mrr-2026-10-05-v1',
    evidenceDigest: digest({
      ...snapshot,
      sources: [...snapshot.sources].sort((a, b) => a.id.localeCompare(b.id)),
      candidates: [...snapshot.candidates].sort((a, b) =>
        a.id.localeCompare(b.id)
      ),
    }),
    evaluatedAt: now.toISOString(),
    sourceTrust:
      'authenticated_producer_report; upstream_facts_not_independently_verified',
    selectedCandidateId: selection,
    verdict: selection ? 'recommendation' : 'hold',
    recommendationKind: !selection
      ? 'hold'
      : protectedWork.length
        ? 'protected_work'
        : commercial.some(item => item.item.id === selection)
          ? 'commercial_experiment'
          : boundedInfrastructure.some(item => item.id === selection)
            ? 'bounded_infrastructure'
            : 'bounded_evidence_gathering',
    frontierCandidateIds: frontier.map(item => item.item.id).sort(),
    evidenceBackedInfrastructureIds: infrastructure.map(item => item.id),
    infrastructureEvidence: infrastructure.map(item => ({
      id: item.id,
      repeatedUsefulJobs: read(item, 'repeatedUsefulJobs'),
      founderMinutesSaved: read(item, 'founderMinutesSaved'),
      implementationCostCents: read(item, 'implementationCostCents'),
      ongoingCostCents: read(item, 'ongoingCostCents'),
      daysToBenefit: read(item, 'daysToBenefit'),
      usefulJobsPerWeekGain: read(item, 'usefulJobsPerWeekGain') ?? 'UNKNOWN',
      reliabilityBasisPointsGain:
        read(item, 'reliabilityBasisPointsGain') ?? 'UNKNOWN',
      reusedProductCount: read(item, 'reusedProductCount') ?? 'UNKNOWN',
      spendingAuthority:
        'none; nonzero costs require separate reconciliation and approval',
    })),
    objective: snapshot.objective,
    bottleneck: {
      stage: snapshot.bottleneck.stage,
      evidence: bottleneckSourceUsable ? 'current-observation' : 'UNKNOWN',
    },
    funnel,
    capacity,
    rankedWork: eligible.map(item => ({
      id: item.id,
      objectiveClass: item.objectiveClass,
      causalPath: item.causalPath,
      targetFunnelStage: item.targetFunnelStage,
      boundedInvariant: item.boundedInvariant,
      expectedObjectiveImpact: read(item, 'expectedObjectiveImpact'),
      constrainedResourceCost: {
        agentMinutes: read(item, 'agentMinutes'),
        ciMinutes: read(item, 'ciMinutes'),
        founderMinutes: read(item, 'additionalFounderMinutesPerDay'),
        cashCents: read(item, 'incrementalSpendCents'),
      },
    })),
    commercialTarget: {
      recurringMrrCents: snapshot.objective.targetRecurringMrrCents,
      deadline: snapshot.objective.deadline,
    },
    protectedWorkIds: protectedWork.map(item => item.id),
    financials,
    salary: {
      annualPersonalSalaryGoalsDollars: [
        32000, 50000, 70000, 100000, 150000, 200000,
      ],
      grossOrTakeHome: 'UNRESOLVED',
      sustainability: 'UNKNOWN',
      reinvestUpTo100Percent: 'optional; does not require founder salary zero',
    },
    cost: {
      authorizedMonthlyCeilingCents: 100000,
      reportedEstimateCents: 120000,
      headroom: 'UNKNOWN',
      reconciliation: 'JOV-5926/JOV-5927 required',
    },
    unknowns: [...unknowns].sort(),
    authority: { dispatchAuthority: 'none', allowedMutations: [] },
  };
}
