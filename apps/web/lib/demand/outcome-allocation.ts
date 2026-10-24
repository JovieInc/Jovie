import type { DemandAllocationPlan } from './allocation-contract';
import type { DemandAllocationLedger } from './allocation-governor';
import {
  capabilityGapId,
  compilePresenceOutcome,
  OutcomeCompilerError,
} from './outcome-compiler';
import type { CompileOutcomeCommand } from './outcome-contract';

/** Extends existing allocation rows; no second registry, queue, store or execution authority. */
export function applyOutcomeDrafts(
  ledger: DemandAllocationLedger,
  command: CompileOutcomeCommand,
  now: Date
): void {
  const drafts = compilePresenceOutcome(
    command,
    now,
    ledger.rows.flatMap(row =>
      row.plan.capabilityDraft ? [row.plan.capabilityDraft] : []
    )
  );
  for (const draft of drafts) {
    const id = capabilityGapId(draft.scope, draft.primitive);
    const existing = ledger.rows.find(row => row.plan.id === id);
    const observations: DemandAllocationPlan['observations'] = draft.demand.map(
      item => ({
        observedAt: item.observedAt,
        surface: 'agent-api',
        request: draft.outcome,
        capability: draft.primitive.id,
        job: draft.outcome,
        icpAdjacent: true,
        provenance: {
          kind: item.provenance.kind,
          sourceKey: `${draft.scope.tenantId}:${item.provenance.sourceKey}`,
          requestId: item.id,
        },
      })
    );
    if (existing) {
      if (!existing.plan.capabilityDraft || existing.execution)
        throw new OutcomeCompilerError('capability-gap-conflict');
      existing.plan.capabilityDraft = draft;
      existing.plan.observations = observations;
    } else {
      if (ledger.rows.length >= 200)
        throw new OutcomeCompilerError('capability-capacity-full');
      ledger.rows.push({
        plan: {
          id,
          kind: 'research',
          capabilityDraft: draft,
          context: {},
          observations,
          authorization: {
            ref: 'capability-draft:disabled',
            lowRisk: false,
            effortMinutes: 1,
            validUntil: draft.demand[0].observedAt,
          },
          prediction: {
            metrics: { qualityScore: command.budget.minCorrectness },
            sourceRef: draft.demand[0].evidenceRef,
            reviewAfterHours: 24,
          },
        },
        decisions: [],
        execution: null,
        reviews: [],
      });
    }
  }
}
