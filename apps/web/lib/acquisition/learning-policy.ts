/** JOV-1879: deterministic acquisition policy, consumed by existing owners.
 * No scheduler, ledger, issue writer, model judge, sender or promotion authority.
 */
import { createHash } from 'node:crypto';
import {
  ACTIVATION_PILOT_EXPERIMENT_ID,
  type EvaluationInput,
  evaluatePilot,
  specDigest,
} from '@/lib/activation/pilot-controller';
import type {
  CertificationReviewPacket,
  FounderCertificationDecision,
} from '@/lib/agent-os/certification';
import { stableSerialize } from '@/lib/stable-serialize';
import {
  type ImprovementEvidence,
  ImprovementEvidenceSchema,
  type ImprovementPlan,
  ImprovementPlanSchema,
  LEARNING_RESOURCES,
  type LearningBudget,
  LearningBudgetSchema,
  LearningEventSchema,
  type LearningFailure,
  LearningResourcesSchema,
} from './learning-contract';

export function learningDigest(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value)).digest('hex');
}

/** Check the next operation; the existing execution owner reserves atomically. */
export function learningBudgetBlockers(
  input: unknown,
  next: unknown
): string[] {
  const budget = LearningBudgetSchema.safeParse(input);
  const cost = LearningResourcesSchema.safeParse(next);
  if (!budget.success || !cost.success) return ['unknown-budget-or-cost'];
  if (budget.data.cancelled) return ['cancelled'];
  return (['case', 'experiment'] as const).flatMap(scope =>
    LEARNING_RESOURCES.filter(
      resource =>
        budget.data[scope].used[resource] >
          budget.data[scope].limit[resource] ||
        (cost.data[resource] > 0 &&
          budget.data[scope].used[resource] + cost.data[resource] >
            budget.data[scope].limit[resource])
    ).map(resource => `${scope}-budget:${resource}`)
  );
}

const FAILURE_OWNER: Record<LearningFailure, { issue: string; route: string }> =
  {
    broken_artifact: { issue: 'JOV-5598', route: 'product_defect' },
    claim_activation_failure: { issue: 'JOV-5912', route: 'product_defect' },
    delivery_failure: { issue: 'JOV-6427', route: 'deterministic_regression' },
    insufficient_evidence: { issue: 'JOV-6428', route: 'candidate_correction' },
    missing_repeated_value: { issue: 'JOV-6472', route: 'experiment_revision' },
    poor_job_offer_fit: { issue: 'JOV-6428', route: 'candidate_correction' },
    unavailable_capability: { issue: 'JOV-5598', route: 'product_defect' },
    unsupported_copy: { issue: 'JOV-1878', route: 'copy_revision' },
    unsupported_paid_inference: {
      issue: 'JOV-6428',
      route: 'candidate_correction',
    },
    wrong_ambiguous_identity: {
      issue: 'JOV-6430',
      route: 'candidate_correction',
    },
  };

export interface AffectedCandidate {
  readonly tenantId: string;
  readonly productId: string;
  readonly candidateId: string;
  readonly capability: string;
  readonly version: string;
}

/** Exact keys are persisted by the existing run/event owner, atomically with
 * its effect. A plan alone is not a durable subscription or an executed fix.
 */
export function planAcquisitionLearningEvent(input: {
  event: unknown;
  seenEventKeys: readonly string[];
  existingFixKeys: readonly string[];
  affectedCandidates: readonly AffectedCandidate[];
  budget: LearningBudget;
  nextCost: unknown;
}) {
  const event = LearningEventSchema.parse(input.event);
  // Evidence-reference ordering and repeated delivery are not material changes.
  const { evidenceRefs: _refs, ...binding } = event;
  const eventKey = learningDigest(binding);
  const stop = learningBudgetBlockers(input.budget, input.nextCost);
  if (input.affectedCandidates.length > 200) stop.push('reconciliation-cap');
  const base = { eventKey, evidenceRefs: event.evidenceRefs };
  if (stop.length) return { ...base, action: 'stop' as const, blockers: stop };
  if (input.seenEventKeys.includes(eventKey)) {
    return { ...base, action: 'unchanged' as const };
  }
  // Silence and opt-outs never imply a failure label or authorize a new attempt.
  if (event.type === 'nonresponse' || event.type === 'opt_out') {
    return { ...base, action: 'observe' as const, cause: 'unknown' as const };
  }
  if (event.type === 'capability_fix_landed') {
    const candidates =
      event.fixedVersion && event.fixedVersion !== event.version
        ? input.affectedCandidates.filter(candidate =>
            (['tenantId', 'productId', 'capability', 'version'] as const).every(
              field => candidate[field] === event[field]
            )
          )
        : [];
    return {
      ...base,
      action: 'rebuild' as const,
      candidateIds: [...new Set(candidates.map(row => row.candidateId))],
      // New attempts must retain history and reacquire exact-version approval.
      preserves: ['attempts', 'human-decisions', 'evidence-labels'] as const,
      reauthorizesOutreach: false as const,
    };
  }
  if (event.type === 'material_source_changed') {
    return {
      ...base,
      action: 'rebuild' as const,
      candidateIds: [event.candidateId],
      preserves: ['attempts', 'human-decisions', 'evidence-labels'] as const,
      reauthorizesOutreach: false as const,
    };
  }
  if (!event.failureClass) return { ...base, action: 'observe' as const };
  const fixKey = learningDigest([
    event.tenantId,
    event.productId,
    event.failureClass,
    event.capability,
    event.version,
  ]);
  return {
    ...base,
    action: 'route' as const,
    ...FAILURE_OWNER[event.failureClass],
    fixKey,
    fixAction: input.existingFixKeys.includes(fixKey) ? 'reuse' : 'create',
    fixtureRef: `record://acquisition-regressions/${fixKey}`,
    compilerOwner: 'JOV-2967' as const,
  };
}

export function improvementApprovalDigest(
  plan: ImprovementPlan,
  evidence: ImprovementEvidence
): string {
  return learningDigest({ plan, evidence });
}

export interface ImprovementDecision {
  readonly subjectId: string;
  readonly decision: 'promote' | 'retain' | 'reject' | 'rollback';
  readonly blockers: readonly string[];
  readonly selectedVersion: string;
  readonly approvalDigest: string;
  readonly evidence: ImprovementEvidence;
  readonly managementDecisionRef: string;
  readonly learningCandidate: {
    readonly owner: 'JOV-2967';
    readonly planRef: string;
    readonly evidenceRef: string;
    readonly status: 'eligible' | 'blocked';
  };
  readonly executionAuthority: 'none';
}

/** Evaluate trusted owner receipts, never client-submitted scores/approvals.
 * `promote` is a recommendation for existing shipping/certification policy.
 */
export function evaluateAcquisitionImprovement(input: {
  plan: unknown;
  evidence: unknown;
  budget: LearningBudget;
  pilot: EvaluationInput | null;
  approval: FounderCertificationDecision | null;
  now: string;
}): ImprovementDecision {
  const plan = ImprovementPlanSchema.parse(input.plan);
  const evidence = ImprovementEvidenceSchema.parse(input.evidence);
  const budget = LearningBudgetSchema.parse(input.budget);
  const approvalDigest = improvementApprovalDigest(plan, evidence);
  const blockers = learningBudgetBlockers(
    budget,
    Object.fromEntries(LEARNING_RESOURCES.map(key => [key, 0]))
  );
  const now = Date.parse(input.now);
  if (!Number.isFinite(now)) blockers.push('invalid-evaluation-time');
  if (evidence.sourceSha !== plan.sourceSha)
    blockers.push('source-revision-mismatch');
  if (Date.parse(plan.frozenAt) > now) blockers.push('future-freeze');
  if (now >= Date.parse(plan.reviewBy)) blockers.push('review-expired');
  for (const scope of ['case', 'experiment'] as const) {
    if (
      stableSerialize(budget[scope].limit) !==
      stableSerialize(plan.budget[scope])
    )
      blockers.push('budget-changed-after-freeze');
    if (
      LEARNING_RESOURCES.some(
        resource =>
          budget[scope].limit[resource] > 0 &&
          budget[scope].used[resource] >= budget[scope].limit[resource]
      )
    )
      blockers.push(`${scope}-budget-exhausted`);
  }
  for (const split of ['development', 'replay', 'heldout'] as const) {
    if (evidence.comparisons[split].digest !== plan.cases[split].digest)
      blockers.push(`case-manifest-changed:${split}`);
    if (evidence.comparisons[split].status === 'unknown')
      blockers.push(`comparison-unknown:${split}`);
  }
  if (evidence.heldoutEvaluations !== 1) blockers.push('holdout-reused');
  let pilot: ReturnType<typeof evaluatePilot> | null = null;
  if (plan.kind === 'commercial_experiment') {
    if (
      !evidence.humanLabelRefs.length ||
      !evidence.outcomeCalibrationRefs.length
    )
      blockers.push('independent-calibration-missing');
    if (!input.pilot) blockers.push('pilot-missing');
    else {
      const p = input.pilot;
      const assignments = new Map(p.assignments.map(a => [a.unitId, a]));
      const invalidReceipts =
        assignments.size !== p.assignments.length ||
        p.assignments.some(
          a =>
            a.experimentId !== p.spec.experimentId ||
            !Number.isFinite(Date.parse(a.assignedAtIso)) ||
            Date.parse(a.assignedAtIso) > now
        ) ||
        p.exposures.some(e => {
          const a = assignments.get(e.unitId);
          return (
            !a ||
            e.experimentId !== p.spec.experimentId ||
            e.arm !== a.arm ||
            e.surfaceVersion !== p.spec.surface.version ||
            !Number.isFinite(Date.parse(e.exposedAtIso)) ||
            Date.parse(e.exposedAtIso) < Date.parse(a.assignedAtIso) ||
            Date.parse(e.exposedAtIso) > now
          );
        }) ||
        p.outcomes.some(o => {
          if (o.event !== p.spec.primaryOutcome.event) return false;
          const a = assignments.get(o.unitId);
          const elapsed =
            Date.parse(o.occurredAtIso) - Date.parse(a?.assignedAtIso ?? '');
          return (
            !a ||
            !Number.isFinite(elapsed) ||
            elapsed < 0 ||
            elapsed > p.spec.primaryOutcome.horizonHours * 3_600_000 ||
            Date.parse(o.occurredAtIso) > now
          );
        });
      const start = Math.min(
        ...input.pilot.assignments.map(a => Date.parse(a.assignedAtIso))
      );
      if (
        input.pilot.spec.experimentId !== ACTIVATION_PILOT_EXPERIMENT_ID ||
        input.pilot.spec.cohort.id !== plan.cohort ||
        specDigest(input.pilot.spec) !== plan.pilotSpecDigest ||
        input.pilot.nowIso !== input.now ||
        invalidReceipts ||
        plan.chosenVariable !== 'copy' ||
        Date.parse(plan.window.start) !== start ||
        Date.parse(plan.window.end) !==
          start + input.pilot.spec.observationWindowDays * 86_400_000 ||
        stableSerialize([...plan.protectedMetrics].sort()) !==
          stableSerialize(input.pilot.spec.guardrails.map(g => g.id).sort())
      )
        blockers.push('pilot-binding-mismatch');
      else pilot = evaluatePilot(input.pilot);
      if (
        input.pilot.spec.guardrails.some(
          g => !Number.isFinite(input.pilot?.guardrailObservations?.[g.id])
        )
      )
        blockers.push('protected-metric-missing');
    }
    if (evidence.mode !== 'actual')
      blockers.push('commercial-outcome-not-actual');
    if (
      evidence.instrumentation !== 'complete' ||
      !evidence.attributable ||
      evidence.sourceCoverage.expected === 0 ||
      evidence.sourceCoverage.observed !== evidence.sourceCoverage.expected ||
      evidence.lagHours === null ||
      evidence.uncertainty.length > 0 ||
      Date.parse(evidence.matureThrough) < Date.parse(plan.window.end) ||
      Date.parse(plan.window.end) > now ||
      Date.parse(evidence.matureThrough) > Date.parse(evidence.observedAt) ||
      Date.parse(evidence.observedAt) > now
    )
      blockers.push('outcomes-incomplete-or-uncertain');
    if (
      [
        evidence.usefulResult,
        evidence.realPayment,
        evidence.retainedValue,
      ].some(row => row.denominator === 0) ||
      evidence.fullWorkflowCost.usd === null ||
      evidence.fullWorkflowCost.manualRescueMinutes === null ||
      !evidence.fullWorkflowCost.includesFailures ||
      !evidence.fullWorkflowCost.includesManualRescue
    )
      blockers.push('whole-workflow-evidence-missing');
    const approval = input.approval;
    if (
      !approval ||
      approval.decision !== 'approved' ||
      approval.certifierAuthority === 'machine' ||
      !approval.reviewer.trim() ||
      approval.subjectId !== plan.id ||
      approval.evidenceDigest !== approvalDigest ||
      !Number.isFinite(Date.parse(approval.decidedAt)) ||
      Date.parse(approval.decidedAt) < Date.parse(evidence.observedAt) ||
      Date.parse(approval.decidedAt) > now ||
      now >= Date.parse(plan.reviewBy)
    )
      blockers.push('human-approval-missing-or-stale');
  }
  const regressed = Object.values(evidence.comparisons).some(
    result => result.status === 'regressed'
  );
  const decision =
    pilot?.decision === 'rollback'
      ? 'rollback'
      : regressed || pilot?.decision === 'reject'
        ? 'reject'
        : blockers.length ||
            (plan.kind === 'commercial_experiment' &&
              pilot?.decision !== 'promote')
          ? 'retain'
          : 'promote';
  if (pilot && pilot.decision !== 'promote') blockers.push(pilot.reason);
  return {
    subjectId: plan.id,
    decision,
    blockers: [...new Set(blockers)],
    selectedVersion:
      decision === 'promote'
        ? plan.challenger[plan.chosenVariable]
        : plan.incumbent[plan.chosenVariable],
    approvalDigest,
    evidence,
    managementDecisionRef: plan.managementDecisionRef,
    learningCandidate: {
      owner: 'JOV-2967',
      planRef: `record://acquisition-improvements/${learningDigest(plan)}`,
      evidenceRef: evidence.receiptRef,
      status: decision === 'promote' ? 'eligible' : 'blocked',
    },
    executionAuthority: 'none',
  };
}

/** Add the decision and blockers to the existing Ovi certification detail.
 * This evidence cannot replace machine tests, a founder decision or admission.
 */
export function attachAcquisitionLearningReview(
  packet: CertificationReviewPacket,
  decision: ImprovementDecision
): CertificationReviewPacket {
  if (packet.subject.id !== decision.subjectId)
    throw new Error('Learning decision and review subject disagree.');
  if (packet.source?.sha !== decision.evidence.sourceSha)
    throw new Error('Learning evidence and review source disagree.');
  const receipt = {
    id: 'acquisition-learning-policy',
    tier: 'invariant_evaluation' as const,
    status:
      decision.decision === 'promote'
        ? ('passed' as const)
        : ('blocked' as const),
    sourceSha: decision.evidence.sourceSha,
    ref: decision.learningCandidate.evidenceRef,
    digest: decision.approvalDigest,
    summary: `${decision.decision}: ${decision.blockers.join(', ') || 'existing shipping controls required'}`,
  };
  return {
    ...packet,
    invariantEvaluation: [
      ...packet.invariantEvaluation.filter(row => row.id !== receipt.id),
      receipt,
    ],
  };
}
