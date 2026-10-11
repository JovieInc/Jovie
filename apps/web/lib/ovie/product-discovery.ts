/**
 * Product discovery reconciliation (JOV-6472).
 *
 * Connects existing customer evidence, constraints, and alternatives into one
 * deterministic answer: which customer problem or operating constraint should
 * be addressed next, and what is the cheapest useful action.
 *
 * Adopt-first boundary: JOV-6433 owns feedback capture/classification and
 * now/later/never disposition, JOV-5916 owns canonical evidence, JOV-5949 owns
 * allocation, JOV-5817 owns bottleneck remediation, JOV-5944 owns the deduped
 * decision router this module emits into. This module owns only the
 * opportunity/diagnosis projection and alternative comparison — it creates no
 * new evidence store, scheduler, or execution controller.
 *
 * Invariants enforced here:
 * - Observations, inferred causes, and proposed solutions stay separate
 *   (`entryKind`), matching the JOV-5916 operational-memory kind contract.
 * - Dogfood/synthetic entries may prove usability or reliability but never
 *   count as independent buyers, demand, or willingness to pay.
 * - A large funnel drop-off alone cannot establish root cause; confounded or
 *   uncorroborated drops yield an evidence step, not an investment priority.
 * - Missing economics stay null — no fabricated ROI.
 * - Unchanged inputs retain the incumbent decision (JOV-5944 dedupe).
 */

export const PRODUCT_DISCOVERY_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Evidence join
// ---------------------------------------------------------------------------

/**
 * 'observation' = what was seen; 'inference' = suspected cause;
 * 'proposal' = suggested solution. Never merged into one record.
 */
export type EvidenceEntryKind = 'observation' | 'inference' | 'proposal';

export type EvidenceSourceKind =
  | 'conversation'
  | 'onboarding-failure'
  | 'support'
  | 'objection'
  | 'usage'
  | 'cancellation'
  | 'paid-outcome'
  | 'retained-outcome';

/** 'dogfood'/'synthetic' prove usability/reliability, never independent demand. */
export type EvidenceCohort = 'customer' | 'dogfood' | 'synthetic';

export type EvidenceSeverity = 'blocking' | 'major' | 'minor' | 'unknown';

export interface CustomerEvidence {
  readonly id: string;
  readonly entryKind: EvidenceEntryKind;
  readonly sourceKind: EvidenceSourceKind;
  /** Canonical source ref (conversation id, support ticket, Stripe event, …). */
  readonly sourceRef: string;
  readonly observedAtIso: string;
  readonly customerRef: string | null;
  readonly cohort: EvidenceCohort;
  readonly segment: string;
  readonly job: string;
  readonly problem: string;
  readonly observedBehavior: string;
  /** Exact denominator where known ('12 of 40 onboarding starts'); null = unknown. */
  readonly denominator: string | null;
  readonly severity: EvidenceSeverity;
  readonly workaround: string | null;
  readonly buyingContext: string | null;
  /** Ids of evidence this entry disagrees with (statements vs behavior). */
  readonly contradictsEvidenceIds?: readonly string[];
  /** What is NOT known about this observation. */
  readonly missingness?: string | null;
  /** Shared key for repeated reports of the same thing; deduped on first win. */
  readonly dedupeKey?: string | null;
}

export interface EvidenceDuplicate {
  readonly id: string;
  readonly duplicateOf: string;
  readonly key: string;
}

export type Representativeness =
  | 'single-customer'
  | 'concentrated'
  | 'distributed';

export interface EvidenceGroup {
  readonly key: string;
  readonly segment: string;
  readonly job: string;
  readonly problem: string;
  readonly observationIds: readonly string[];
  readonly inferenceIds: readonly string[];
  readonly proposalIds: readonly string[];
  /** Distinct real customers behind customer-cohort observations. */
  readonly distinctCustomerCount: number;
  /** Dogfood + synthetic observations — usability proof, never demand. */
  readonly internalOnlyCount: number;
  /** Share of customer observations contributed by the loudest customer (0–1). */
  readonly loudestCustomerShare: number;
  /**
   * True when one customer supplies >60% of customer observations across a
   * multi-customer group — loud minority, not representative cohort.
   */
  readonly loudMinority: boolean;
  readonly representativeness: Representativeness;
  readonly severities: readonly EvidenceSeverity[];
  readonly workarounds: readonly string[];
  readonly buyingContexts: readonly string[];
  readonly denominators: readonly string[];
  /** Statement-vs-behavior disagreements, kept visible rather than resolved. */
  readonly contradictions: readonly {
    readonly evidenceId: string;
    readonly contradictsId: string;
  }[];
  readonly missingness: readonly string[];
}

export interface EvidenceJoinResult {
  readonly groups: readonly EvidenceGroup[];
  readonly duplicates: readonly EvidenceDuplicate[];
}

function evidenceDedupeKey(evidence: CustomerEvidence): string {
  return (
    evidence.dedupeKey ??
    `${evidence.sourceRef}|${evidence.customerRef ?? 'anon'}|${evidence.observedBehavior}`
  );
}

/**
 * Join authorized evidence to a specific customer segment/job/problem.
 * Repeated sources/customers dedupe on `dedupeKey` (first occurrence wins).
 * Observations, inferences, and proposals remain in separate id lists.
 */
export function joinCustomerEvidence(
  evidence: readonly CustomerEvidence[]
): EvidenceJoinResult {
  const seen = new Map<string, string>();
  const duplicates: EvidenceDuplicate[] = [];
  const groups = new Map<
    string,
    { key: string; entries: CustomerEvidence[] }
  >();

  for (const entry of evidence) {
    const dedupe = evidenceDedupeKey(entry);
    const first = seen.get(dedupe);
    if (first) {
      duplicates.push({ id: entry.id, duplicateOf: first, key: dedupe });
      continue;
    }
    seen.set(dedupe, entry.id);
    const key = `${entry.segment}|${entry.job}|${entry.problem}`;
    const group = groups.get(key) ?? { key, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }

  const result: EvidenceGroup[] = [...groups.values()].map(group => {
    const { entries } = group;
    const first = entries[0];
    const observations = entries.filter(e => e.entryKind === 'observation');
    const customerObservations = observations.filter(
      e => e.cohort === 'customer'
    );

    const perCustomer = new Map<string, number>();
    for (const entry of customerObservations) {
      const ref = entry.customerRef ?? entry.sourceRef;
      perCustomer.set(ref, (perCustomer.get(ref) ?? 0) + 1);
    }
    const distinctCustomerCount = perCustomer.size;
    const loudest = Math.max(0, ...perCustomer.values());
    const loudestCustomerShare =
      customerObservations.length > 0
        ? loudest / customerObservations.length
        : 0;
    const loudMinority =
      distinctCustomerCount >= 2 && loudestCustomerShare > 0.6;
    const representativeness: Representativeness =
      distinctCustomerCount <= 1
        ? 'single-customer'
        : loudMinority
          ? 'concentrated'
          : 'distributed';

    const ids = new Set(entries.map(e => e.id));
    const contradictions = entries.flatMap(e =>
      (e.contradictsEvidenceIds ?? [])
        .filter(id => ids.has(id))
        .map(id => ({ evidenceId: e.id, contradictsId: id }))
    );

    return {
      key: group.key,
      segment: first.segment,
      job: first.job,
      problem: first.problem,
      observationIds: observations.map(e => e.id),
      inferenceIds: entries
        .filter(e => e.entryKind === 'inference')
        .map(e => e.id),
      proposalIds: entries
        .filter(e => e.entryKind === 'proposal')
        .map(e => e.id),
      distinctCustomerCount,
      internalOnlyCount: observations.filter(e => e.cohort !== 'customer')
        .length,
      loudestCustomerShare,
      loudMinority,
      representativeness,
      severities: entries.map(e => e.severity),
      workarounds: entries
        .map(e => e.workaround)
        .filter((w): w is string => w != null),
      buyingContexts: entries
        .map(e => e.buyingContext)
        .filter((c): c is string => c != null),
      denominators: entries
        .map(e => e.denominator)
        .filter((d): d is string => d != null),
      contradictions,
      missingness: entries
        .map(e => e.missingness ?? null)
        .filter((m): m is string => m != null),
    };
  });

  return { groups: result, duplicates };
}

// ---------------------------------------------------------------------------
// Revenue-path diagnosis
// ---------------------------------------------------------------------------

/** Revenue path per JOV-5243 outcome contract + delivery/founder-attention. */
export const REVENUE_PATH_STAGES = [
  'prospect-reach',
  'offer-understanding',
  'first-useful-result',
  'payment',
  'retained-value',
  'delivery-reliability',
  'founder-attention',
] as const;

export interface RevenueStageReading {
  readonly key: string;
  /** Null = telemetry missing for this stage. */
  readonly entrants: number | null;
  readonly completed: number | null;
  /** Customer-evidence ids corroborating a causal reading. */
  readonly evidenceIds: readonly string[];
  /** Known uncontrolled alternative explanations (traffic mix shift, …). */
  readonly confounds?: readonly string[];
  readonly denominatorNote?: string | null;
}

export type StageMeasurement =
  | 'measured'
  | 'incomplete-telemetry'
  | 'unmeasured';

export interface StageDiagnosis {
  readonly key: string;
  readonly measurement: StageMeasurement;
  readonly conversion: number | null;
  readonly dropOff: number | null;
  /** Share of total measured drop across all stages (0–1). */
  readonly dropShare: number | null;
  readonly confounded: boolean;
  readonly corroborated: boolean;
}

export interface RevenuePathDiagnosis {
  readonly stages: readonly StageDiagnosis[];
  /** Stage with the largest measured drop share, if any. */
  readonly suspectedConstraintKey: string | null;
  /**
   * True only when the suspected stage is corroborated by customer evidence
   * AND has no uncontrolled confounds. A big drop alone is not a diagnosis.
   */
  readonly constraintEstablished: boolean;
  /** When true, the cheapest useful action is evidence, not investment. */
  readonly uncertaintyDominates: boolean;
  readonly why: string;
}

/**
 * Diagnose the current revenue path. Null entrants/completed mean the stage
 * cannot be ranked at all — incomplete telemetry is flagged, never inferred.
 */
export function diagnoseRevenuePath(
  readings: readonly RevenueStageReading[]
): RevenuePathDiagnosis {
  const stages: StageDiagnosis[] = readings.map(reading => {
    const measured =
      reading.entrants != null &&
      reading.completed != null &&
      reading.entrants > 0;
    const measurement: StageMeasurement = measured
      ? 'measured'
      : reading.entrants == null && reading.completed == null
        ? 'unmeasured'
        : 'incomplete-telemetry';
    return {
      key: reading.key,
      measurement,
      conversion: measured ? reading.completed! / reading.entrants! : null,
      dropOff: measured ? reading.entrants! - reading.completed! : null,
      dropShare: null,
      confounded: (reading.confounds ?? []).length > 0,
      corroborated: reading.evidenceIds.length > 0,
    };
  });

  const totalDrop = stages.reduce((sum, s) => sum + (s.dropOff ?? 0), 0);
  for (const stage of stages) {
    if (stage.dropOff != null && totalDrop > 0) {
      (stage as { dropShare: number | null }).dropShare =
        stage.dropOff / totalDrop;
    }
  }

  const measured = stages.filter(
    s => s.measurement === 'measured' && s.dropShare != null
  );
  const suspected =
    measured.sort((a, b) => (b.dropShare ?? 0) - (a.dropShare ?? 0))[0] ?? null;

  const constraintEstablished =
    suspected != null && suspected.corroborated && !suspected.confounded;
  const uncertaintyDominates = suspected == null || !constraintEstablished;

  const why =
    suspected == null
      ? 'No measured stage can be ranked; telemetry gaps dominate.'
      : constraintEstablished
        ? `${suspected.key} holds the largest drop share and is corroborated by customer evidence with no uncontrolled confounds.`
        : suspected.confounded
          ? `${suspected.key} shows the largest drop but confounds are uncontrolled; drop size alone cannot establish root cause.`
          : `${suspected.key} shows the largest drop but lacks corroborating customer evidence; drop size alone cannot establish root cause.`;

  return {
    stages,
    suspectedConstraintKey: suspected?.key ?? null,
    constraintEstablished,
    uncertaintyDominates,
    why,
  };
}

// ---------------------------------------------------------------------------
// Opportunity projection
// ---------------------------------------------------------------------------

/** Outcome → opportunity → alternatives → assumptions/tests, linked by ref. */
export interface OpportunityProjection {
  readonly outcomeId: string;
  readonly opportunityId: string;
  readonly segment: string;
  readonly job: string;
  readonly problem: string;
  readonly alternativeIds: readonly string[];
  /** Assumption → cheapest test that could falsify it. */
  readonly assumptions: readonly {
    readonly id: string;
    readonly statement: string;
    readonly testRef: string;
  }[];
}

// ---------------------------------------------------------------------------
// Alternative comparison
// ---------------------------------------------------------------------------

export type AlternativeKind =
  | 'improve-existing'
  | 'manual-service'
  | 'build-new'
  | 'gather-evidence'
  | 'retain-incumbent';

export interface DiscoveryAlternative {
  readonly id: string;
  readonly kind: AlternativeKind;
  /** Inapplicable alternatives must state why rather than write an essay. */
  readonly applicable: boolean;
  readonly inapplicableReason?: string | null;
  /** 0–1 expected customer benefit; null = economics unknown. */
  readonly expectedBenefit: number | null;
  readonly timeToEvidenceDays: number | null;
  /** Full-workflow cost, maintenance cost, and constrained-capacity cost. */
  readonly workflowCost: number | null;
  readonly maintenanceCost: number | null;
  readonly capacityCost: number | null;
  readonly reversibility: 'easy' | 'moderate' | 'hard' | null;
  readonly downside: string | null;
  /** Builds reusable infrastructure regardless of outcome. */
  readonly infraReuse: boolean;
  /** 0–1; null = uncalibrated. */
  readonly confidence: number | null;
  readonly evidenceIds: readonly string[];
}

export type AlternativeVerdict =
  | 'recommended'
  | 'viable'
  | 'inapplicable'
  | 'novelty-only';

export interface EvaluatedAlternative {
  readonly id: string;
  readonly kind: AlternativeKind;
  readonly verdict: AlternativeVerdict;
  readonly score: number;
  readonly reason: string;
  /** Reusable-infrastructure benefit, reported separately from demand. */
  readonly reusableInfrastructure: boolean;
  readonly unknownEconomics: readonly string[];
}

const REVERSIBILITY_RANK = { easy: 0, moderate: 1, hard: 2 } as const;

function clamp01(value: number | null): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function totalCost(alt: DiscoveryAlternative): number | null {
  const parts = [alt.workflowCost, alt.maintenanceCost, alt.capacityCost];
  if (parts.every(p => p == null)) return null;
  return parts.reduce<number>((sum, p) => sum + (p ?? 0), 0);
}

/**
 * Evaluate alternatives. Inapplicable alternatives must carry a reason —
 * no manufactured five-essay comparisons. A build-new challenger with no
 * evidence and no measured benefit is 'novelty-only' and can never be
 * recommended. When diagnosis uncertainty dominates, the cheapest viable
 * 'gather-evidence' option is recommended over investment.
 */
export function evaluateAlternatives(
  alternatives: readonly DiscoveryAlternative[],
  options: { readonly uncertaintyDominates: boolean }
): readonly EvaluatedAlternative[] {
  const evaluated: EvaluatedAlternative[] = alternatives.map(alt => {
    if (!alt.applicable) {
      if (!alt.inapplicableReason?.trim()) {
        throw new Error(
          `Alternative ${alt.id} marked inapplicable without a reason`
        );
      }
      return {
        id: alt.id,
        kind: alt.kind,
        verdict: 'inapplicable' as const,
        score: 0,
        reason: alt.inapplicableReason,
        reusableInfrastructure: alt.infraReuse,
        unknownEconomics: [],
      };
    }

    const unknownEconomics = (
      [
        ['expectedBenefit', alt.expectedBenefit],
        ['timeToEvidenceDays', alt.timeToEvidenceDays],
        ['workflowCost', alt.workflowCost],
        ['maintenanceCost', alt.maintenanceCost],
        ['capacityCost', alt.capacityCost],
        ['confidence', alt.confidence],
      ] as const
    )
      .filter(([, v]) => v == null)
      .map(([k]) => k);

    const noveltyOnly =
      alt.kind === 'build-new' &&
      alt.evidenceIds.length === 0 &&
      alt.expectedBenefit == null;
    if (noveltyOnly) {
      return {
        id: alt.id,
        kind: alt.kind,
        verdict: 'novelty-only' as const,
        score: 0,
        reason:
          'New-build challenger with no evidence and unknown benefit; novelty is not an argument.',
        reusableInfrastructure: alt.infraReuse,
        unknownEconomics,
      };
    }

    const cost = totalCost(alt);
    const costPenalty = cost != null ? 1 / (1 + cost) : 1;
    const score =
      clamp01(alt.expectedBenefit) *
      clamp01(alt.confidence) *
      costPenalty *
      (alt.infraReuse ? 1.1 : 1);

    return {
      id: alt.id,
      kind: alt.kind,
      verdict: 'viable' as const,
      score,
      reason: '',
      reusableInfrastructure: alt.infraReuse,
      unknownEconomics,
    };
  });

  const viable = evaluated
    .filter(e => e.verdict === 'viable')
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      const aAlt = alternatives.find(alt => alt.id === a.id)!;
      const bAlt = alternatives.find(alt => alt.id === b.id)!;
      const aRev =
        REVERSIBILITY_RANK[aAlt.reversibility ?? 'hard'] ??
        REVERSIBILITY_RANK.hard;
      const bRev =
        REVERSIBILITY_RANK[bAlt.reversibility ?? 'hard'] ??
        REVERSIBILITY_RANK.hard;
      return aRev - bRev;
    });

  if (viable.length === 0) return evaluated;

  if (options.uncertaintyDominates) {
    const gather = viable
      .filter(e => e.kind === 'gather-evidence')
      .sort((a, b) => {
        const aAlt = alternatives.find(alt => alt.id === a.id)!;
        const bAlt = alternatives.find(alt => alt.id === b.id)!;
        return (totalCost(aAlt) ?? 0) - (totalCost(bAlt) ?? 0);
      })[0];
    const pick = gather ?? viable[0];
    (pick as { verdict: AlternativeVerdict }).verdict = 'recommended';
    (pick as { reason: string }).reason = gather
      ? 'Uncertainty dominates; this is the cheapest bounded investigation likely to change a material decision.'
      : 'Uncertainty dominates but no gather-evidence option exists; cheapest viable alternative recommended.';
    return evaluated;
  }

  const winner = viable[0];
  (winner as { verdict: AlternativeVerdict }).verdict = 'recommended';
  (winner as { reason: string }).reason =
    'Highest evidence-weighted benefit per unit cost among viable alternatives.';
  return evaluated;
}

// ---------------------------------------------------------------------------
// Bounded investigation
// ---------------------------------------------------------------------------

export type InvestigationDisposition =
  | 'proceed'
  | 'modify'
  | 'hold'
  | 'reject'
  | 'unresolved';

export interface BoundedInvestigation {
  readonly unresolvedQuestion: string;
  /** What evidence sources are in scope. Never auto-includes customer outreach. */
  readonly sourceScope: readonly string[];
  readonly owner: string;
  readonly costCap: string;
  readonly timeCapDays: number;
  readonly retryCap: number;
  readonly expectedDecisionRelevance: string;
  readonly terminalDispositions: readonly InvestigationDisposition[];
}

/**
 * Recommend the cheapest bounded investigation. Caps are mandatory — no
 * endless research. 'customer-outreach' scope requires explicit authorization
 * (no automatic customer outreach).
 */
export function recommendInvestigation(input: {
  readonly unresolvedQuestion: string;
  readonly sourceScope: readonly string[];
  readonly owner: string;
  readonly costCap: string;
  readonly timeCapDays: number;
  readonly retryCap: number;
  readonly expectedDecisionRelevance: string;
  readonly terminalDispositions?: readonly InvestigationDisposition[];
  readonly authorizesCustomerOutreach?: boolean;
}): BoundedInvestigation {
  if (!input.unresolvedQuestion.trim()) {
    throw new Error('Investigation requires an unresolved question');
  }
  if (!input.owner.trim() || !input.costCap.trim()) {
    throw new Error('Investigation requires an owner and a cost cap');
  }
  if (
    !Number.isFinite(input.timeCapDays) ||
    input.timeCapDays <= 0 ||
    !Number.isFinite(input.retryCap) ||
    input.retryCap < 0
  ) {
    throw new Error(
      'Investigation requires positive time and retry caps — no endless research'
    );
  }
  if (
    input.sourceScope.includes('customer-outreach') &&
    input.authorizesCustomerOutreach !== true
  ) {
    throw new Error(
      'customer-outreach scope requires explicit authorization — no automatic outreach'
    );
  }
  return {
    unresolvedQuestion: input.unresolvedQuestion,
    sourceScope: input.sourceScope,
    owner: input.owner,
    costCap: input.costCap,
    timeCapDays: input.timeCapDays,
    retryCap: input.retryCap,
    expectedDecisionRelevance: input.expectedDecisionRelevance,
    terminalDispositions: input.terminalDispositions ?? [
      'proceed',
      'modify',
      'hold',
      'reject',
      'unresolved',
    ],
  };
}

// ---------------------------------------------------------------------------
// JOV-5944 deduplicated decision emission
// ---------------------------------------------------------------------------

export interface DiscoveryDecision {
  readonly id: string;
  readonly kind: 'product-discovery-constraint';
  /** Stable fingerprint of inputs; unchanged inputs retain the incumbent. */
  readonly fingerprint: string;
  readonly constraintKey: string | null;
  readonly recommendedAlternativeId: string | null;
  readonly investigation: BoundedInvestigation | null;
  readonly summary: string;
  readonly evidenceIds: readonly string[];
  readonly issuedAtIso: string;
}

export type DecisionDisposition =
  | 'issued'
  | 'retained-incumbent'
  | 'held-capacity'
  | 'held-protected-work';

export interface DiscoveryDecisionResult {
  readonly disposition: DecisionDisposition;
  readonly decision: DiscoveryDecision | null;
  readonly why: string;
}

/** Deterministic small hash for fingerprinting — not cryptographic. */
function fingerprint(inputs: readonly string[]): string {
  const text = inputs.filter(Boolean).sort().join('|');
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return `fp_${(hash >>> 0).toString(16)}`;
}

export function computeDecisionFingerprint(input: {
  readonly constraintKey: string | null;
  readonly recommendedAlternativeId: string | null;
  readonly evidenceIds: readonly string[];
}): string {
  return fingerprint([
    input.constraintKey ?? 'none',
    input.recommendedAlternativeId ?? 'none',
    ...input.evidenceIds,
  ]);
}

/**
 * Emit one deduplicated decision/job for JOV-5944 after material new evidence.
 * Identical fingerprints retain the incumbent. Approved management WIP limit,
 * customer obligations, safety/recovery capacity, and protected winners gate
 * issuance — violations hold rather than override.
 */
export function issueDiscoveryDecision(input: {
  readonly constraintKey: string | null;
  readonly recommendedAlternativeId: string | null;
  readonly investigation: BoundedInvestigation | null;
  readonly summary: string;
  readonly evidenceIds: readonly string[];
  readonly nowIso: string;
  readonly previous: DiscoveryDecision | null;
  readonly guards: {
    readonly wipWithinLimit: boolean;
    readonly protectedWorkIntact: boolean;
  };
}): DiscoveryDecisionResult {
  const fp = computeDecisionFingerprint(input);

  if (input.previous && input.previous.fingerprint === fp) {
    return {
      disposition: 'retained-incumbent',
      decision: input.previous,
      why: 'Inputs unchanged; incumbent decision retained.',
    };
  }

  if (!input.guards.wipWithinLimit) {
    return {
      disposition: 'held-capacity',
      decision: null,
      why: 'Management WIP limit reached; decision held rather than displacing approved work.',
    };
  }
  if (!input.guards.protectedWorkIntact) {
    return {
      disposition: 'held-protected-work',
      decision: null,
      why: 'Customer obligations, safety/recovery capacity, or protected winners would be displaced; decision held.',
    };
  }

  return {
    disposition: 'issued',
    decision: {
      id: `disc_${fp}`,
      kind: 'product-discovery-constraint',
      fingerprint: fp,
      constraintKey: input.constraintKey,
      recommendedAlternativeId: input.recommendedAlternativeId,
      investigation: input.investigation,
      summary: input.summary,
      evidenceIds: input.evidenceIds,
      issuedAtIso: input.nowIso,
    },
    why: 'Material new evidence produced a new fingerprint; one deduplicated decision emitted.',
  };
}

// ---------------------------------------------------------------------------
// Full pipeline
// ---------------------------------------------------------------------------

export interface ProductDiscoveryInput {
  readonly evidence: readonly CustomerEvidence[];
  readonly revenuePath: readonly RevenueStageReading[];
  readonly alternatives: readonly DiscoveryAlternative[];
  readonly projections?: readonly OpportunityProjection[];
  readonly investigation?: Parameters<typeof recommendInvestigation>[0] | null;
  readonly previousDecision?: DiscoveryDecision | null;
  readonly guards: {
    readonly wipWithinLimit: boolean;
    readonly protectedWorkIntact: boolean;
  };
  readonly nowIso: string;
  readonly summary: string;
}

export interface ProductDiscoveryResult {
  readonly schemaVersion: typeof PRODUCT_DISCOVERY_SCHEMA_VERSION;
  readonly join: EvidenceJoinResult;
  readonly diagnosis: RevenuePathDiagnosis;
  readonly alternatives: readonly EvaluatedAlternative[];
  readonly projections: readonly OpportunityProjection[];
  readonly investigation: BoundedInvestigation | null;
  readonly decision: DiscoveryDecisionResult;
}

export function runProductDiscovery(
  input: ProductDiscoveryInput
): ProductDiscoveryResult {
  const join = joinCustomerEvidence(input.evidence);
  const diagnosis = diagnoseRevenuePath(input.revenuePath);
  const alternatives = evaluateAlternatives(input.alternatives, {
    uncertaintyDominates: diagnosis.uncertaintyDominates,
  });
  const recommended =
    alternatives.find(a => a.verdict === 'recommended') ?? null;
  const investigation =
    diagnosis.uncertaintyDominates && input.investigation
      ? recommendInvestigation(input.investigation)
      : null;

  const decision = issueDiscoveryDecision({
    constraintKey: diagnosis.suspectedConstraintKey,
    recommendedAlternativeId: recommended?.id ?? null,
    investigation,
    summary: input.summary,
    evidenceIds: join.groups.flatMap(g => [
      ...g.observationIds,
      ...g.inferenceIds,
    ]),
    nowIso: input.nowIso,
    previous: input.previousDecision ?? null,
    guards: input.guards,
  });

  return {
    schemaVersion: PRODUCT_DISCOVERY_SCHEMA_VERSION,
    join,
    diagnosis,
    alternatives,
    projections: input.projections ?? [],
    investigation,
    decision,
  };
}
