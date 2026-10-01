import { describe, expect, it } from 'vitest';
import {
  type ConstraintMetric,
  type ControlLoopCandidate,
  type ControlLoopObjective,
  describeBindingConstraint,
  type FounderDecisionPacket,
  receiptStage,
  reconcileControlLoop,
  recordOutcomeReceipts,
} from '@/lib/ovie/control-loop';

const NOW = '2026-09-30T12:00:00.000Z';

function metric(
  id: string,
  overrides: Partial<ConstraintMetric> = {}
): ConstraintMetric {
  return {
    id,
    source: 'canonical-metrics',
    baseline: '0',
    target: 'healthy',
    denominator: null,
    owner: 'summer',
    observedAtIso: NOW,
    freshnessDeadlineIso: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

const OBJECTIVE: ControlLoopObjective = {
  id: 'obj.mrr-5k',
  title: '$5K MRR',
  metric: metric('mrr-usd', { source: 'stripe', target: '$5000' }),
};

function candidate(
  id: string,
  overrides: Partial<ControlLoopCandidate> = {}
): ControlLoopCandidate {
  return {
    id,
    objectiveId: OBJECTIVE.id,
    owner: 'summer',
    source: 'canonical-metrics',
    title: `Constraint ${id}`,
    whyNow: `why ${id}`,
    currentValue: 'x',
    delta: null,
    target: 'y',
    confidence: 1,
    freshness: 'fresh',
    goalPath: 'revenue',
    causalHypothesis: null,
    nextAction: `act on ${id}`,
    expectedImpact: 0.5,
    urgency: 0.5,
    informationGain: 0.5,
    unblockValue: 0.5,
    attentionCost: 1,
    summerCanAct: true,
    removalEvent: 'cleared',
    metric: metric(`m.${id}`),
    measurementState: 'measured',
    stopsBeingBindingWhen: `${id} reaches target`,
    requiresFounder: false,
    ...overrides,
  };
}

function packet(): FounderDecisionPacket {
  return {
    decision: 'Approve $500 spend on acquisition experiment',
    whyNow: 'Binding constraint is acquisition spend approval',
    blocked: 'Acquisition experiment cannot start without spend approval',
    options: [
      { id: 'approve', label: 'Approve $500', tradeoff: 'burn +$500' },
      { id: 'reject', label: 'Reject', tradeoff: 'constraint persists' },
    ],
    evidence: ['funnel.stage=acquisition', 'candidates.ranked'],
    expectedMetricEffect: '+MRR toward $5K',
    confidence: 0.7,
    freshness: 'fresh',
    defaultIfSilent: 'Do not spend',
    artifactRef: 'exp/acq-1',
    artifactRevision: 'r1',
  };
}

describe('reconcileControlLoop', () => {
  it('selects exactly one binding constraint and keeps secondaries visible', () => {
    const state = reconcileControlLoop({
      objective: OBJECTIVE,
      nowIso: NOW,
      candidates: [
        candidate('a', { expectedImpact: 0.9, urgency: 0.9 }),
        candidate('b', { expectedImpact: 0.3, urgency: 0.3 }),
      ],
    });
    const binding = state.constraints.filter(c => c.status === 'binding');
    expect(binding).toHaveLength(1);
    expect(state.bindingConstraintId).toBe('a');
    expect(
      state.constraints.filter(c => c.status === 'secondary').map(c => c.id)
    ).toEqual(['b']);
  });

  it('ranks missing instrumentation as a coverage defect in the same pool', () => {
    const state = reconcileControlLoop({
      objective: OBJECTIVE,
      nowIso: NOW,
      candidates: [
        candidate('unmeasured-thing', {
          measurementState: 'unmeasured',
          expectedImpact: 1,
          urgency: 1,
          informationGain: 1,
          unblockValue: 1,
          attentionCost: 0.5,
        }),
        candidate('measured-thing', {
          expectedImpact: 0.1,
          urgency: 0.1,
          informationGain: 0.1,
          unblockValue: 0.1,
        }),
      ],
    });
    expect(state.bindingConstraintId).toBe('coverage.unmeasured-thing');
    const original = state.constraints.find(c => c.id === 'unmeasured-thing');
    expect(original?.status).toBe('coverage-defect');
  });

  it('never treats unmeasured scope as absent or binding-invisible', () => {
    const state = reconcileControlLoop({
      objective: OBJECTIVE,
      nowIso: NOW,
      candidates: [candidate('x', { measurementState: 'unknown' })],
    });
    expect(state.constraints.find(c => c.id === 'x')?.status).toBe(
      'coverage-defect'
    );
    expect(state.bindingConstraintId).toBe('coverage.x');
  });

  it('withholds the founder packet while machine work remains binding', () => {
    const state = reconcileControlLoop({
      objective: OBJECTIVE,
      nowIso: NOW,
      candidates: [
        candidate('machine-work', {
          expectedImpact: 1,
          urgency: 1,
          informationGain: 1,
          unblockValue: 1,
        }),
        candidate('founder-only', {
          requiresFounder: true,
          summerCanAct: false,
          decisionPacket: packet(),
          expectedImpact: 0.1,
          urgency: 0.1,
          informationGain: 0.1,
          unblockValue: 0.1,
        }),
      ],
    });
    expect(state.bindingConstraintId).toBe('machine-work');
    expect(state.founderDecision).toBeNull();
    expect(state.pendingAutonomousConstraintIds).toContain('machine-work');
  });

  it('materializes exactly one self-contained packet at a founder boundary', () => {
    const state = reconcileControlLoop({
      objective: OBJECTIVE,
      nowIso: NOW,
      candidates: [
        candidate('founder-only', {
          requiresFounder: true,
          summerCanAct: false,
          decisionPacket: packet(),
        }),
      ],
    });
    expect(state.bindingConstraintId).toBe('founder-only');
    expect(state.founderDecision?.artifactRef).toBe('exp/acq-1');
    expect(state.founderDecision?.options.length).toBeGreaterThan(0);
  });

  it('transitions cleared constraints to guardrails and picks the next constraint', () => {
    const first = reconcileControlLoop({
      objective: OBJECTIVE,
      nowIso: NOW,
      candidates: [
        candidate('a', {
          expectedImpact: 1,
          urgency: 1,
          informationGain: 1,
          unblockValue: 1,
        }),
        candidate('b', {
          expectedImpact: 0.5,
          urgency: 0.5,
          informationGain: 0.5,
          unblockValue: 0.5,
        }),
      ],
    });
    expect(first.bindingConstraintId).toBe('a');
    const second = reconcileControlLoop({
      objective: OBJECTIVE,
      nowIso: '2026-10-01T00:00:00.000Z',
      previous: first,
      candidates: [
        candidate('a', { cleared: true }),
        candidate('b', {
          expectedImpact: 0.5,
          urgency: 0.5,
          informationGain: 0.5,
          unblockValue: 0.5,
        }),
      ],
    });
    expect(second.bindingConstraintId).toBe('b');
    expect(second.guardrails.map(g => g.constraintId)).toContain('a');
    expect(second.constraints.find(c => c.id === 'a')?.status).toBe('cleared');
  });

  it('is idempotent across restart: same inputs, same state, no duplicate receipts', () => {
    const candidates = [candidate('a')];
    const once = reconcileControlLoop({
      objective: OBJECTIVE,
      nowIso: NOW,
      candidates,
    });
    const receipt = {
      id: 'rcpt-1',
      constraintId: 'a',
      decisionPacketRef: null,
      actionId: 'act-1',
      executionState: 'delivered' as const,
      observedOutcome: null,
      recordedAtIso: NOW,
    };
    const withReceipt = recordOutcomeReceipts(once, [receipt]);
    const again = recordOutcomeReceipts(
      reconcileControlLoop({
        objective: OBJECTIVE,
        nowIso: NOW,
        candidates,
        previous: withReceipt,
      }),
      [receipt]
    );
    expect(again.receipts).toHaveLength(1);
    expect(again.bindingConstraintId).toBe('a');
    // Full JSON round-trip proves the state survives restart/redelivery.
    const restored = reconcileControlLoop({
      objective: OBJECTIVE,
      nowIso: NOW,
      candidates,
      previous: JSON.parse(JSON.stringify(again)),
    });
    expect(restored.receipts).toHaveLength(1);
  });
});

describe('outcome receipts', () => {
  it('keeps delivery, certification, and outcome as distinct stages', () => {
    const base = {
      id: 'r',
      constraintId: 'a',
      decisionPacketRef: null,
      actionId: 'act',
      recordedAtIso: NOW,
    };
    expect(
      receiptStage({
        ...base,
        executionState: 'pending',
        observedOutcome: null,
      })
    ).toBe('decision');
    expect(
      receiptStage({
        ...base,
        executionState: 'delivered',
        observedOutcome: null,
      })
    ).toBe('execution');
    expect(
      receiptStage({
        ...base,
        executionState: 'certified',
        observedOutcome: null,
      })
    ).toBe('certified');
    expect(
      receiptStage({
        ...base,
        executionState: 'certified',
        observedOutcome: {
          metricId: 'mrr-usd',
          before: '$4000',
          after: '$4300',
          uncertainty: 'low confidence, n=12',
        },
      })
    ).toBe('outcome');
  });
});

describe('describeBindingConstraint', () => {
  it('always answers objective, #1 blocker, metric, and release condition', () => {
    const state = reconcileControlLoop({
      objective: OBJECTIVE,
      nowIso: NOW,
      candidates: [candidate('a')],
    });
    const answer = describeBindingConstraint(state);
    expect(answer.objective).toContain('$5K MRR');
    expect(answer.constraintId).toBe('a');
    expect(answer.metricBeingOptimized).toBe('m.a');
    expect(answer.stopsBeingBindingWhen).toBe('a reaches target');
  });
});
