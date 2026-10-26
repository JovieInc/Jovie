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
    const trials = mergeReceipts(
      prior?.trials ?? [],
      command.trials.filter(item =>
        suppliers.some(
          supplier => supplierDigest(supplier) === item.supplierDigest
        )
      )
    );
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
    const freshFacts = facts.filter(
      item =>
        (item.supplierDigest === null
          ? item.sourceRef.startsWith('jovie:canonical:')
          : eligible.some(
              supplier => supplierDigest(supplier) === item.supplierDigest
            )) &&
        Date.parse(item.observedAt) <= time &&
        Date.parse(item.validUntil) > time &&
        Date.parse(item.validUntil) > Date.parse(item.observedAt) &&
        time - Date.parse(item.observedAt) <=
          command.budget.maxFreshnessSeconds * 1000
    );
    const known = freshFacts.some(
      item => item.state === 'known' && item.match === 'verified'
    );
    if (known && !prior) return [];
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
    const selected = measured[0]?.supplier;
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
              'Measured route meets the contract and economic floor; registration remains disabled pending owner certification.',
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
                'No permitted route has sufficient measured or expected value; retain unknown/partial.',
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
        budget: command.budget,
        decision,
      }),
    ];
  });
}
