import { createHash } from 'node:crypto';
import {
  type CapabilityDraft,
  type CapabilitySupplier,
  type CompileOutcomeCommand,
  capabilityDraftSchema,
  capabilitySupplierSchema,
  compileOutcomeCommandSchema,
  PRESENCE_CURRENT_CONTRACT,
} from './outcome-contract';
import { projectSupplierFulfillment } from './outcome-fulfillment';

export class OutcomeCompilerError extends Error {}
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Parse at the boundary for deterministic key ordering and exact policy/version binding. */
export function supplierDigest(supplier: CapabilitySupplier): string {
  return digest(capabilityDraftSchema.shape.suppliers.element.parse(supplier));
}
export function capabilityGapId(
  scope: CapabilityDraft['scope'],
  primitive: CapabilityDraft['primitive']
): string {
  return `capability-${digest([scope.tenantId, scope.subjectId, 'presence.profile-current/v1', primitive.id, primitive.version, primitive.kind]).slice(0, 48)}`;
}
const sameScope = (a: CapabilityDraft['scope'], b: CapabilityDraft['scope']) =>
  a.tenantId === b.tenantId && a.subjectId === b.subjectId;
const samePrimitive = (
  a: CapabilityDraft['primitive'],
  b: CapabilityDraft['primitive']
) => a.id === b.id && a.version === b.version && a.kind === b.kind;

function mergeReceipts<T extends { id: string }>(
  previous: T[],
  current: T[]
): T[] {
  const receipts = new Map(previous.map(item => [item.id, item]));
  for (const item of current) {
    const existing = receipts.get(item.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(item))
      throw new OutcomeCompilerError('capability-receipt-conflict');
    receipts.set(item.id, item);
  }
  return [...receipts.values()].sort((a, b) => a.id.localeCompare(b.id));
}
function netValue(
  metrics: CapabilitySupplier['expected'],
  command: CompileOutcomeCommand
) {
  return (
    metrics.informationGain *
      metrics.coverage *
      metrics.correctness *
      (metrics.successfulActionRate ?? 1) *
      command.budget.valuePerUsefulOutcomeCents -
    metrics.fullyLoadedCostCents
  );
}
const sourceRank = (supplier: CapabilitySupplier) =>
  capabilitySupplierSchema.shape.route.options.indexOf(supplier.route);
function meetsFloor(
  metrics: CapabilitySupplier['expected'],
  command: CompileOutcomeCommand,
  kind: CapabilityDraft['primitive']['kind']
) {
  const budget = command.budget;
  return (
    metrics.correctness >= budget.minCorrectness &&
    metrics.falseMatchRate <= budget.maxFalseMatchRate &&
    metrics.coverage >= budget.minCoverage &&
    metrics.freshnessSeconds <= budget.maxFreshnessSeconds &&
    metrics.latencyMs <= budget.maxLatencyMs &&
    (kind === 'fact' ||
      (metrics.successfulActionRate !== null &&
        metrics.successfulActionRate >= budget.minCorrectness)) &&
    netValue(metrics, command) > 0
  );
}

/** Pure compilation; only the governor persists. No collection, spend, connection or execution. */
export function compilePresenceOutcome(
  input: unknown,
  now: Date,
  previous: readonly CapabilityDraft[] = []
): CapabilityDraft[] {
  const command = compileOutcomeCommandSchema.parse(input);
  const time = now.getTime();
  if (!Number.isFinite(time)) throw new OutcomeCompilerError('invalid-clock');
  if (command.demand.some(item => Date.parse(item.observedAt) > time))
    throw new OutcomeCompilerError('future-demand-evidence');
  const scopedReceipts = [
    ...(command.certifications ?? []),
    ...(command.outcomes ?? []),
  ];
  if (scopedReceipts.some(item => !sameScope(item.scope, command.scope)))
    throw new OutcomeCompilerError('capability-receipt-scope-mismatch');
  if (
    scopedReceipts.some(
      item =>
        !PRESENCE_CURRENT_CONTRACT.requirements.some(requirement =>
          samePrimitive(item.primitive, requirement)
        )
    )
  )
    throw new OutcomeCompilerError('unsupported-capability-receipt');
  if (
    (command.certifications ?? []).some(
      item =>
        Date.parse(item.verifiedAt) > time ||
        Date.parse(item.expiresAt) <= Date.parse(item.verifiedAt)
    )
  )
    throw new OutcomeCompilerError('invalid-capability-certification-window');
  if (
    (command.outcomes ?? []).some(
      item =>
        Date.parse(item.startedAt) > Date.parse(item.completedAt) ||
        Date.parse(item.completedAt) > time
    )
  )
    throw new OutcomeCompilerError('invalid-capability-outcome-window');
  // Duplicate supplier identities could make matching or trial choice order-dependent.
  const keys = command.suppliers.map(item =>
    digest([item.scope, item.primitive, item.id, item.version])
  );
  if (new Set(keys).size !== keys.length)
    throw new OutcomeCompilerError('duplicate-capability-supplier');

  let trialBudget = command.budget.maxTrialCostCents;
  let trialSlots = command.budget.maxConcurrentTrials;
  return PRESENCE_CURRENT_CONTRACT.requirements.flatMap(primitive => {
    const prior = previous.find(
      item =>
        sameScope(item.scope, command.scope) &&
        samePrimitive(item.primitive, primitive)
    );
    // Facts/suppliers are a current snapshot. Omission/revocation invalidates previous selection.
    const facts = command.facts.filter(
      item =>
        sameScope(item.scope, command.scope) &&
        samePrimitive(item.primitive, primitive)
    );
    const suppliers = command.suppliers.filter(
      item =>
        sameScope(item.scope, command.scope) &&
        samePrimitive(item.primitive, primitive)
    );
    // Receipts are immutable history; current supplier snapshots still govern revocation.
    let certifications = mergeReceipts(
      prior?.certifications ?? [],
      (command.certifications ?? []).filter(item =>
        samePrimitive(item.primitive, primitive)
      )
    );
    let outcomes = mergeReceipts(
      prior?.outcomes ?? [],
      (command.outcomes ?? []).filter(item =>
        samePrimitive(item.primitive, primitive)
      )
    );
    let trials = mergeReceipts(
      prior?.trials ?? [],
      command.trials.filter(item =>
        suppliers.some(
          supplier => supplierDigest(supplier) === item.supplierDigest
        )
      )
    );
    // Bound the evidence window without refusing terminal invalidation events.
    // Advancing the floor invalidates older certificates as well as old receipts,
    // so evicting a tombstone can never revive its prior consent/certification.
    let receiptFloor = prior?.receiptFloor ?? null;
    for (const times of [
      certifications.map(item => item.verifiedAt),
      outcomes.map(item => item.completedAt),
      trials.map(item => item.completedAt),
    ]) {
      if (times.length <= 100) continue;
      const discarded = times
        .sort((a, b) => Date.parse(a) - Date.parse(b))
        .slice(0, -100);
      const floor = discarded.at(-1)!;
      if (!receiptFloor || Date.parse(floor) > Date.parse(receiptFloor))
        receiptFloor = floor;
    }
    if (receiptFloor) {
      const floor = Date.parse(receiptFloor);
      certifications = certifications.filter(
        item => Date.parse(item.verifiedAt) > floor
      );
      outcomes = outcomes.filter(item => Date.parse(item.completedAt) > floor);
      trials = trials.filter(item => Date.parse(item.completedAt) > floor);
    }
    if (
      trials.some(
        item =>
          Date.parse(item.startedAt) > Date.parse(item.completedAt) ||
          Date.parse(item.completedAt) > time
      )
    )
      throw new OutcomeCompilerError('invalid-capability-trial-window');
    const eligible = suppliers.filter(
      item =>
        ['candidate', 'available'].includes(item.status) &&
        item.authorizationRef &&
        item.privacy === 'approved' &&
        item.terms === 'approved' &&
        Date.parse(item.reviewedAt) <= time &&
        Date.parse(item.validUntil) > time &&
        Date.parse(item.validUntil) > Date.parse(item.reviewedAt)
    );
    const fulfillmentFor = (supplier: CapabilitySupplier) =>
      projectSupplierFulfillment(
        supplier,
        supplierDigest(supplier),
        certifications,
        outcomes,
        now
      );
    const freshFacts = facts.filter(
      item =>
        (item.supplierDigest === null
          ? item.sourceRef.startsWith('jovie:canonical:')
          : eligible.some(supplier => {
              if (
                supplierDigest(supplier) !== item.supplierDigest ||
                !['read', 'sync'].includes(supplier.authority ?? '')
              )
                return false;
              const result = fulfillmentFor(supplier);
              return (
                result.newest &&
                result.accepted.some(
                  receipt =>
                    receipt.id === result.newest?.id &&
                    receipt.evidenceRefs.includes(item.evidenceRef) &&
                    Date.parse(receipt.completedAt) >=
                      Date.parse(item.observedAt) &&
                    time - Date.parse(receipt.completedAt) <=
                      command.budget.maxFreshnessSeconds * 1000
                )
              );
            })) &&
        Date.parse(item.observedAt) <= time &&
        Date.parse(item.validUntil) > time &&
        Date.parse(item.validUntil) > Date.parse(item.observedAt) &&
        time - Date.parse(item.observedAt) <=
          command.budget.maxFreshnessSeconds * 1000
    );
    const known = freshFacts.some(
      item => item.state === 'known' && item.match === 'verified'
    );
    if (known && !prior && !certifications.length && !outcomes.length)
      return [];
    const measured = eligible
      .flatMap(supplier => {
        const receipt = trials
          .filter(item => item.supplierDigest === supplierDigest(supplier))
          .sort(
            (a, b) =>
              Date.parse(b.completedAt) - Date.parse(a.completedAt) ||
              a.id.localeCompare(b.id)
          )[0];
        if (
          !receipt ||
          time - Date.parse(receipt.completedAt) >
            command.budget.maxFreshnessSeconds * 1000 ||
          !meetsFloor(receipt.realized, command, primitive.kind)
        )
          return [];
        return [{ supplier, receipt }];
      })
      .sort(
        (a, b) =>
          netValue(b.receipt.realized, command) -
            netValue(a.receipt.realized, command) ||
          sourceRank(a.supplier) - sourceRank(b.supplier) ||
          a.supplier.id.localeCompare(b.supplier.id)
      );
    // Failed/mature trials do not become an endless instruction to retry the same supplier.
    const challenger = eligible
      .filter(
        item =>
          measured.length === 0 &&
          !trials.some(
            receipt => receipt.supplierDigest === supplierDigest(item)
          ) &&
          trialSlots > 0 &&
          item.trialCostCents <= trialBudget &&
          meetsFloor(item.expected, command, primitive.kind)
      )
      .sort(
        (a, b) =>
          a.trialCostCents - b.trialCostCents ||
          sourceRank(a) - sourceRank(b) ||
          a.id.localeCompare(b.id)
      )[0];
    const selected = measured.find(({ supplier }) => {
      const result = fulfillmentFor(supplier);
      if (!result.summary.certified) return false;
      if (!result.summary.attemptedJobs) return true;
      const receipt = result.newest;
      return (
        receipt &&
        result.accepted.some(item => item.id === receipt.id) &&
        time - Date.parse(receipt.completedAt) <=
          command.budget.maxFreshnessSeconds * 1000 &&
        meetsFloor(
          {
            ...receipt.realized,
            correctness: Math.min(
              receipt.realized.correctness,
              result.summary.correctCompletedJobs / result.summary.attemptedJobs
            ),
            fullyLoadedCostCents:
              result.summary.costPerSuccessfulOutcomeCents ?? 0,
          },
          command,
          primitive.kind
        )
      );
    })?.supplier;
    const evidenceSupplier =
      selected ??
      measured[0]?.supplier ??
      eligible.find(supplier =>
        outcomes.some(
          receipt => receipt.supplierDigest === supplierDigest(supplier)
        )
      );
    const fulfillment = projectSupplierFulfillment(
      evidenceSupplier,
      evidenceSupplier ? supplierDigest(evidenceSupplier) : null,
      certifications,
      outcomes,
      now
    ).summary;
    if (!known && !selected && challenger) {
      trialBudget -= challenger.trialCostCents;
      trialSlots -= 1;
    }
    const decision: CapabilityDraft['decision'] = known
      ? {
          kind: 'reuse',
          supplierDigest: null,
          reason: 'Fresh canonical evidence satisfies this primitive.',
        }
      : selected
        ? {
            kind: 'promote',
            supplierDigest: supplierDigest(selected),
            reason:
              'Owner-certified measured route meets the contract and economic floor; execution remains separately authorized.',
          }
        : challenger
          ? {
              kind: 'trial',
              supplierDigest: supplierDigest(challenger),
              reason:
                'Cheapest permitted decision-changing experiment within the declared budget; execution is separately authorized.',
            }
          : {
              kind: 'no_action',
              supplierDigest: null,
              reason:
                'No owner-certified route meets the measured floor or permitted trial remains; retain unknown/partial.',
            };
    return [
      capabilityDraftSchema.parse({
        evaluatedAt: now.toISOString(),
        scope: command.scope,
        outcome: command.outcome,
        primitive,
        enabled: false,
        state: known
          ? 'known'
          : freshFacts.some(
                item => item.state === 'partial' && item.match === 'verified'
              )
            ? 'partial'
            : 'unknown',
        demand: mergeReceipts(prior?.demand ?? [], command.demand),
        facts,
        suppliers,
        trials,
        certifications,
        outcomes,
        receiptFloor,
        fulfillment,
        budget: command.budget,
        decision,
      }),
    ];
  });
}
