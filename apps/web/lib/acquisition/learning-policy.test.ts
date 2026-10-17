import { describe, expect, it } from 'vitest';
import {
  ACTIVATION_PILOT_SPEC,
  specDigest,
} from '@/lib/activation/pilot-controller';
import { PILOT_FIXTURES } from '@/lib/activation/pilot-fixtures';
import type { CertificationReviewPacket } from '@/lib/agent-os/certification';
import {
  type ImprovementEvidence,
  type ImprovementPlan,
  ImprovementPlanSchema,
  LEARNING_FAILURES,
  LEARNING_RESOURCES,
  type LearningBudget,
  type LearningEvent,
} from './learning-contract';
import {
  attachAcquisitionLearningReview,
  evaluateAcquisitionImprovement,
  improvementApprovalDigest,
  learningBudgetBlockers,
  planAcquisitionLearningEvent,
} from './learning-policy';

const SPEC = ACTIVATION_PILOT_SPEC;
const NOW = '2026-10-10T00:00:00.000Z';
const digest = 'a'.repeat(64);
const resources = {
  browserCalls: 2,
  humanReviewMinutes: 5,
  modelCalls: 2,
  repairCycles: 2,
  researchPages: 3,
  retries: 1,
  spendUsd: 1,
  variants: 1,
};
const zero = Object.fromEntries(
  LEARNING_RESOURCES.map(key => [key, 0])
) as typeof resources;

function budget(): LearningBudget {
  return {
    cancelled: false,
    case: { limit: { ...resources }, used: { ...zero } },
    experiment: { limit: { ...resources }, used: { ...zero } },
  };
}

function plan(): ImprovementPlan {
  const incumbent = {
    audience: 'artists-v1',
    capability: 'claim-v1',
    copy: 'help-v1',
    offer: 'presence-v1',
    price: 'approved-price-v1',
    source: 'public-v1',
  };
  return {
    id: 'activation-learning',
    version: 'v2',
    owner: 'activation-owner',
    sourceSha: 'a'.repeat(40),
    kind: 'commercial_experiment',
    hypothesis: 'Contextual help improves first useful activation',
    customerProblemRef: 'record://problem/claim-friction',
    competingExplanations: ['Missing contextual help', 'Wrong job or offer'],
    boundedAction: 'Compare the approved help variant on the existing pilot',
    managementDecisionRef: 'record://management/activation-pilot',
    cohort: SPEC.cohort.id,
    incumbent,
    challenger: { ...incumbent, copy: 'help-v2' },
    chosenVariable: 'copy',
    comparisonDesignRef: 'record://activation-pilot/spec',
    pilotSpecDigest: specDigest(SPEC),
    protectedMetrics: SPEC.guardrails.map(row => row.id),
    frozenAt: '2026-09-19T00:00:00.000Z',
    reviewBy: '2026-10-20T00:00:00.000Z',
    window: {
      start: '2026-09-20T00:00:00.000Z',
      end: '2026-10-04T00:00:00.000Z',
    },
    stopCriteria: ['Stop on opt-out, exhausted budget or guardrail breach'],
    rollbackRef: 'record://activation-pilot/rollback',
    budget: { case: { ...resources }, experiment: { ...resources } },
    cases: {
      development: { digest, caseIds: ['dev-1'] },
      replay: { digest: 'b'.repeat(64), caseIds: ['replay-1'] },
      heldout: { digest: 'c'.repeat(64), caseIds: ['protected-1'] },
    },
  };
}

function evidence(): ImprovementEvidence {
  return {
    sourceSha: 'a'.repeat(40),
    mode: 'actual',
    comparisons: {
      development: {
        digest,
        status: 'passed',
        receiptRef: 'record://benchmark/development',
      },
      replay: {
        digest: 'b'.repeat(64),
        status: 'passed',
        receiptRef: 'record://benchmark/replay',
      },
      heldout: {
        digest: 'c'.repeat(64),
        status: 'passed',
        receiptRef: 'record://benchmark/heldout',
      },
    },
    heldoutEvaluations: 1,
    humanLabelRefs: ['record://labels/human-1'],
    outcomeCalibrationRefs: ['record://outcomes/calibration-1'],
    receiptRef: 'record://outcomes/pilot-1',
    observedAt: '2026-10-05T00:00:00.000Z',
    matureThrough: '2026-10-04T00:00:00.000Z',
    instrumentation: 'complete',
    attributable: true,
    sourceCoverage: { observed: 10, expected: 10 },
    operationalPass: { numerator: 10, denominator: 10 },
    usefulResult: { numerator: 5, denominator: 10 },
    realPayment: { numerator: 2, denominator: 10 },
    retainedValue: { numerator: 1, denominator: 10 },
    fullWorkflowCost: {
      usd: 20,
      manualRescueMinutes: 15,
      includesFailures: true,
      includesManualRescue: true,
    },
    lagHours: 24,
    negativeEvidenceRefs: ['record://outcomes/no-useful-result'],
    uncertainty: [],
  };
}

function evaluation(p = plan(), e = evidence()) {
  return {
    plan: p,
    evidence: e,
    budget: budget(),
    pilot: PILOT_FIXTURES.positive(SPEC),
    approval: {
      id: 'human-decision-1',
      subjectId: p.id,
      evidenceDigest: improvementApprovalDigest(p, e),
      decision: 'approved' as const,
      decidedAt: '2026-10-06T00:00:00.000Z',
      reviewer: 'founder',
      notes: null,
    },
    now: NOW,
  };
}

function event(): LearningEvent {
  return {
    tenantId: 'tenant-1',
    productId: 'jovie',
    candidateId: 'candidate-1',
    type: 'candidate_terminal',
    capability: 'profile-build',
    version: 'v1',
    evidenceDigest: digest,
    evidenceRefs: ['record://runs/failed-1'],
    failureClass: 'broken_artifact',
    fixedVersion: null,
  };
}

function intake(e = event()) {
  return {
    event: e,
    seenEventKeys: [] as string[],
    existingFixKeys: [] as string[],
    affectedCandidates: [],
    budget: budget(),
    nextCost: { ...zero, modelCalls: 1 },
  };
}

describe('event-driven acquisition policy', () => {
  it('routes one failure to one fix/fixture, deduplicating repeats across candidates', () => {
    const first = planAcquisitionLearningEvent(intake());
    expect(first.action).toBe('route');
    if (first.action !== 'route') throw new Error('expected a routed failure');
    expect(first).toMatchObject({
      issue: 'JOV-5598',
      fixAction: 'create',
      compilerOwner: 'JOV-2967',
    });
    const repeat = planAcquisitionLearningEvent({
      ...intake(),
      seenEventKeys: [first.eventKey],
    });
    expect(repeat.action).toBe('unchanged');
    const second = planAcquisitionLearningEvent({
      ...intake({ ...event(), candidateId: 'candidate-2' }),
      existingFixKeys: [first.fixKey],
    });
    expect(second).toMatchObject({
      action: 'route',
      fixKey: first.fixKey,
      fixAction: 'reuse',
      fixtureRef: first.fixtureRef,
    });
    const nextVersion = planAcquisitionLearningEvent(
      intake({ ...event(), version: 'v2' })
    );
    expect(nextVersion.action === 'route' && nextVersion.fixKey).not.toBe(
      first.fixKey
    );
  });

  it('treats reordered evidence pointers as unchanged', () => {
    const e = {
      ...event(),
      evidenceRefs: ['record://runs/a', 'record://runs/b'],
    };
    const first = planAcquisitionLearningEvent(intake(e));
    expect(
      planAcquisitionLearningEvent({
        ...intake({ ...e, evidenceRefs: [...e.evidenceRefs].reverse() }),
        seenEventKeys: [first.eventKey],
      }).action
    ).toBe('unchanged');
  });

  it.each(LEARNING_FAILURES)(
    'routes %s to its canonical owner with safe private evidence',
    failureClass => {
      expect(
        planAcquisitionLearningEvent(intake({ ...event(), failureClass }))
      ).toMatchObject({
        action: 'route',
        evidenceRefs: ['record://runs/failed-1'],
      });
    }
  );

  it.each(['nonresponse', 'opt_out'] as const)(
    'keeps %s observational even with a supplied failure label',
    type => {
      expect(
        planAcquisitionLearningEvent(intake({ ...event(), type }))
      ).toMatchObject({
        action: 'observe',
        cause: 'unknown',
      });
    }
  );

  it.each([
    'activation',
    'claim',
    'payment',
    'reply',
    'retained_value',
    'useful_outcome',
  ] as const)(
    'accepts %s receipts without inventing failures or conversions',
    type => {
      expect(
        planAcquisitionLearningEvent(
          intake({ ...event(), type, failureClass: null })
        ).action
      ).toBe('observe');
    }
  );

  it('rebuilds only material fixes in the matching tenant/product/capability/version', () => {
    const e = {
      ...event(),
      type: 'capability_fix_landed' as const,
      fixedVersion: 'v2',
    };
    const candidate = {
      tenantId: e.tenantId,
      productId: e.productId,
      candidateId: e.candidateId,
      capability: e.capability,
      version: e.version,
    };
    const result = planAcquisitionLearningEvent({
      ...intake(e),
      affectedCandidates: [
        candidate,
        candidate,
        { ...candidate, candidateId: 'unaffected', capability: 'checkout' },
        { ...candidate, candidateId: 'new-version', version: 'v2' },
        { ...candidate, candidateId: 'other-tenant', tenantId: 'tenant-2' },
        { ...candidate, candidateId: 'other-product', productId: 'ovie' },
      ],
    });
    expect(result).toMatchObject({
      action: 'rebuild',
      candidateIds: ['candidate-1'],
      reauthorizesOutreach: false,
      preserves: ['attempts', 'human-decisions', 'evidence-labels'],
    });
    expect(
      planAcquisitionLearningEvent({
        ...intake({ ...e, fixedVersion: 'v1' }),
        affectedCandidates: [candidate],
      })
    ).toMatchObject({ candidateIds: [] });
    expect(
      planAcquisitionLearningEvent({
        ...intake(e),
        seenEventKeys: [result.eventKey],
      }).action
    ).toBe('unchanged');
  });

  it('rebuilds only the source-corrected candidate and preserves review history', () => {
    const e = {
      ...event(),
      type: 'material_source_changed' as const,
      failureClass: null,
    };
    const first = planAcquisitionLearningEvent(intake(e));
    expect(first).toMatchObject({
      action: 'rebuild',
      candidateIds: [e.candidateId],
      reauthorizesOutreach: false,
    });
    expect(
      planAcquisitionLearningEvent({
        ...intake(e),
        seenEventKeys: [first.eventKey],
      }).action
    ).toBe('unchanged');
  });

  it('refuses raw contact/message fields and signed external evidence URLs', () => {
    expect(() =>
      planAcquisitionLearningEvent(
        intake({
          ...event(),
          evidenceRefs: ['https://private.example/person?token=secret'],
        })
      )
    ).toThrow();
    expect(() =>
      planAcquisitionLearningEvent({
        ...intake(),
        event: { ...event(), email: 'private@example.com' },
      })
    ).toThrow();
  });
});

describe('bounded execution', () => {
  it.each(LEARNING_RESOURCES)(
    'stops %s at either cap before another call',
    resource => {
      for (const scope of ['case', 'experiment'] as const) {
        const b = budget();
        b[scope].used[resource] = b[scope].limit[resource];
        const cost = { ...zero, [resource]: 1 };
        expect(learningBudgetBlockers(b, cost)).toContain(
          `${scope}-budget:${resource}`
        );
        expect(
          planAcquisitionLearningEvent({
            ...intake(),
            budget: b,
            nextCost: cost,
          }).action
        ).toBe('stop');
      }
    }
  );

  it('permits the final affordable operation, rejects unknown costs and cancellation', () => {
    expect(learningBudgetBlockers(budget(), resources)).toEqual([]);
    expect(
      learningBudgetBlockers(budget(), { ...zero, spendUsd: null })
    ).toEqual(['unknown-budget-or-cost']);
    expect(learningBudgetBlockers(null, zero)).toEqual([
      'unknown-budget-or-cost',
    ]);
    expect(learningBudgetBlockers(budget(), { ...zero, retries: -1 })).toEqual([
      'unknown-budget-or-cost',
    ]);
    expect(
      planAcquisitionLearningEvent({
        ...intake(),
        budget: { ...budget(), cancelled: true },
      })
    ).toMatchObject({ action: 'stop', blockers: ['cancelled'] });
  });

  it('bounds reconciliation rather than sweeping all candidates', () => {
    const e = event();
    expect(
      planAcquisitionLearningEvent({
        ...intake(),
        affectedCandidates: Array.from({ length: 201 }, () => e),
      })
    ).toMatchObject({ action: 'stop', blockers: ['reconciliation-cap'] });
  });
});

describe('immutable comparison and outcome-gated promotion', () => {
  it('proposes a version only from the existing positive pilot, complete outcomes and exact human approval', () => {
    const result = evaluateAcquisitionImprovement(evaluation());
    expect(result).toMatchObject({
      decision: 'promote',
      blockers: [],
      selectedVersion: 'help-v2',
      executionAuthority: 'none',
      managementDecisionRef: plan().managementDecisionRef,
      learningCandidate: { owner: 'JOV-2967', status: 'eligible' },
    });
    expect(result.evidence).toEqual(evidence());
    expect(result.evidence.operationalPass).not.toEqual(
      result.evidence.realPayment
    );
    expect(result.evidence.negativeEvidenceRefs).toEqual(
      evidence().negativeEvidenceRefs
    );
  });

  it('rejects a regressive challenger and retains an uncertain or immature incumbent', () => {
    expect(
      evaluateAcquisitionImprovement({
        ...evaluation(),
        pilot: PILOT_FIXTURES.regressive(SPEC),
      })
    ).toMatchObject({ decision: 'reject', selectedVersion: 'help-v1' });
    for (const pilot of [
      PILOT_FIXTURES.inconclusive(SPEC),
      PILOT_FIXTURES.missingTelemetry(SPEC),
      PILOT_FIXTURES.delayedOutcome(SPEC),
    ]) {
      const result = evaluateAcquisitionImprovement({
        ...evaluation(),
        pilot,
        now: pilot.nowIso,
      });
      expect(result.decision).toBe('retain');
      expect(result.selectedVersion).toBe('help-v1');
    }
  });

  it('recommends rollback on protected harm, preserving all outcome evidence', () => {
    const input = evaluation();
    input.pilot = {
      ...input.pilot,
      guardrailObservations: {
        ...input.pilot.guardrailObservations,
        complaint: 0.5,
      },
    };
    expect(evaluateAcquisitionImprovement(input)).toMatchObject({
      decision: 'rollback',
      selectedVersion: 'help-v1',
      evidence: evidence(),
    });
  });

  it("does not use another experiment's apparent success or harm", () => {
    const input = evaluation();
    const spec = { ...SPEC, experimentId: 'another-experiment' };
    input.pilot = {
      ...input.pilot,
      spec,
      approvedSpecDigest: specDigest(spec),
      guardrailObservations: {
        ...input.pilot.guardrailObservations,
        complaint: 0.5,
      },
    };
    expect(evaluateAcquisitionImprovement(input)).toMatchObject({
      decision: 'retain',
      blockers: expect.arrayContaining(['pilot-binding-mismatch']),
    });
  });

  it('rejects a benchmark regression, manifest edits and repeated tuning of the holdout', () => {
    const e = evidence();
    e.comparisons.heldout.status = 'regressed';
    expect(evaluateAcquisitionImprovement(evaluation(plan(), e)).decision).toBe(
      'reject'
    );
    e.comparisons.heldout.status = 'passed';
    e.comparisons.heldout.digest = 'd'.repeat(64);
    expect(evaluateAcquisitionImprovement(evaluation(plan(), e))).toMatchObject(
      {
        decision: 'retain',
        blockers: expect.arrayContaining(['case-manifest-changed:heldout']),
      }
    );
    e.comparisons.heldout.digest = 'c'.repeat(64);
    e.heldoutEvaluations = 2;
    expect(evaluateAcquisitionImprovement(evaluation(plan(), e))).toMatchObject(
      {
        decision: 'retain',
        blockers: expect.arrayContaining(['holdout-reused']),
      }
    );
  });

  it('requires calibration and never accepts self-issued grades or agent consensus', () => {
    const e = evidence();
    e.humanLabelRefs = [];
    e.outcomeCalibrationRefs = [];
    expect(evaluateAcquisitionImprovement(evaluation(plan(), e))).toMatchObject(
      {
        decision: 'retain',
        blockers: expect.arrayContaining(['independent-calibration-missing']),
      }
    );
    expect(() =>
      evaluateAcquisitionImprovement({
        ...evaluation(),
        evidence: { ...e, modelScore: 1, agentConsensus: true },
      })
    ).toThrow();
  });

  it('retains the incumbent for unknown comparisons, missing pilot/guardrails and invalid event joins', () => {
    const e = evidence();
    e.comparisons.development.status = 'unknown';
    expect(evaluateAcquisitionImprovement(evaluation(plan(), e)).decision).toBe(
      'retain'
    );
    expect(
      evaluateAcquisitionImprovement({ ...evaluation(), pilot: null }).blockers
    ).toContain('pilot-missing');
    const input = evaluation();
    expect(
      evaluateAcquisitionImprovement({
        ...input,
        pilot: { ...input.pilot, guardrailObservations: {} },
      }).blockers
    ).toContain('protected-metric-missing');
    for (const occurredAtIso of [
      'invalid',
      '2026-09-19T00:00:00.000Z',
      '2026-10-09T00:00:00.000Z',
      '2026-10-11T00:00:00.000Z',
    ]) {
      const pilot = {
        ...input.pilot,
        outcomes: input.pilot.outcomes.map(o => ({ ...o, occurredAtIso })),
      };
      expect(evaluateAcquisitionImprovement({ ...input, pilot })).toMatchObject(
        {
          decision: 'retain',
          blockers: expect.arrayContaining(['pilot-binding-mismatch']),
        }
      );
    }
    expect(
      evaluateAcquisitionImprovement({ ...input, now: 'invalid' }).decision
    ).toBe('retain');
    expect(
      evaluateAcquisitionImprovement(
        evaluation(plan(), { ...evidence(), sourceSha: 'b'.repeat(40) })
      ).blockers
    ).toContain('source-revision-mismatch');
  });

  it.each(['shadow', 'replay'] as const)(
    'keeps %s success separate from actual commercial efficacy',
    mode => {
      expect(
        evaluateAcquisitionImprovement(
          evaluation(plan(), { ...evidence(), mode })
        )
      ).toMatchObject({
        decision: 'retain',
        blockers: expect.arrayContaining(['commercial-outcome-not-actual']),
      });
    }
  );

  it('keeps delayed, unattributable, incomplete and negative evidence visible', () => {
    for (const change of [
      { instrumentation: 'delayed' as const },
      { instrumentation: 'missing' as const },
      { attributable: false },
      { lagHours: null },
      { uncertainty: ['Nonresponse cause unknown'] },
      { sourceCoverage: { observed: 9, expected: 10 } },
      { matureThrough: '2026-10-03T00:00:00.000Z' },
      { observedAt: '2026-10-11T00:00:00.000Z' },
    ]) {
      const e = { ...evidence(), ...change };
      const result = evaluateAcquisitionImprovement(evaluation(plan(), e));
      expect(result).toMatchObject({
        decision: 'retain',
        evidence: e,
        blockers: expect.arrayContaining(['outcomes-incomplete-or-uncertain']),
      });
    }
  });

  it('requires exact commercial denominators, failed attempts and manual rescue costs', () => {
    for (const change of [
      { realPayment: { numerator: 0, denominator: 0 } },
      { fullWorkflowCost: { ...evidence().fullWorkflowCost, usd: null } },
      {
        fullWorkflowCost: {
          ...evidence().fullWorkflowCost,
          includesFailures: false,
        },
      },
      {
        fullWorkflowCost: {
          ...evidence().fullWorkflowCost,
          manualRescueMinutes: null,
        },
      },
      {
        fullWorkflowCost: {
          ...evidence().fullWorkflowCost,
          includesManualRescue: false,
        },
      },
    ]) {
      expect(
        evaluateAcquisitionImprovement(
          evaluation(plan(), { ...evidence(), ...change })
        )
      ).toMatchObject({
        decision: 'retain',
        blockers: expect.arrayContaining(['whole-workflow-evidence-missing']),
      });
    }
    expect(() =>
      evaluateAcquisitionImprovement(
        evaluation(plan(), {
          ...evidence(),
          realPayment: { numerator: 11, denominator: 10 },
        })
      )
    ).toThrow();
  });

  it('invalidates stale approvals after corrections, changed plans, machine approvals or expiry', () => {
    const input = evaluation();
    input.evidence = {
      ...input.evidence,
      negativeEvidenceRefs: ['record://outcomes/corrected'],
    };
    expect(evaluateAcquisitionImprovement(input).blockers).toContain(
      'human-approval-missing-or-stale'
    );
    input.evidence = evidence();
    input.plan = { ...input.plan, version: 'v3' };
    expect(evaluateAcquisitionImprovement(input).decision).toBe('retain');
    const machine = evaluation();
    expect(
      evaluateAcquisitionImprovement({
        ...machine,
        approval: { ...machine.approval, certifierAuthority: 'machine' },
      }).decision
    ).toBe('retain');
    expect(
      evaluateAcquisitionImprovement({ ...evaluation(), approval: null })
        .decision
    ).toBe('retain');
    expect(
      evaluateAcquisitionImprovement({
        ...evaluation(),
        now: '2026-10-21T00:00:00.000Z',
      }).blockers
    ).toContain('human-approval-missing-or-stale');
  });

  it('stops promotion on cancellation, exhausted budgets and changed caps', () => {
    const input = evaluation();
    input.budget.cancelled = true;
    expect(evaluateAcquisitionImprovement(input)).toMatchObject({
      decision: 'retain',
      blockers: expect.arrayContaining(['cancelled']),
    });
    input.budget.cancelled = false;
    input.budget.case.used.modelCalls = resources.modelCalls;
    expect(evaluateAcquisitionImprovement(input).blockers).toContain(
      'case-budget-exhausted'
    );
    input.budget.case.limit.modelCalls = 100;
    expect(evaluateAcquisitionImprovement(input).blockers).toContain(
      'budget-changed-after-freeze'
    );
  });

  it('requires one controlled variable, finite windows and disjoint frozen cases', () => {
    const p = plan();
    expect(
      ImprovementPlanSchema.safeParse({
        ...p,
        challenger: { ...p.challenger, price: 'new-price' },
      }).success
    ).toBe(false);
    expect(
      ImprovementPlanSchema.safeParse({ ...p, kind: 'deterministic_repair' })
        .success
    ).toBe(false);
    expect(
      ImprovementPlanSchema.safeParse({
        ...p,
        window: { ...p.window, end: p.window.start },
      }).success
    ).toBe(false);
    expect(
      ImprovementPlanSchema.safeParse({
        ...p,
        cases: { ...p.cases, heldout: p.cases.development },
      }).success
    ).toBe(false);
  });

  it('allows deterministic repairs through ordinary shipping without waiting for commercial outcomes or a human experiment approval', () => {
    const p = plan();
    p.kind = 'deterministic_repair';
    p.challenger = { ...p.incumbent, capability: 'claim-v2' };
    p.chosenVariable = 'capability';
    const e = {
      ...evidence(),
      humanLabelRefs: [],
      outcomeCalibrationRefs: [],
      mode: 'replay' as const,
      fullWorkflowCost: { ...evidence().fullWorkflowCost, usd: null },
      instrumentation: 'delayed' as const,
    };
    expect(
      evaluateAcquisitionImprovement({
        ...evaluation(p, e),
        pilot: null,
        approval: null,
      })
    ).toMatchObject({
      decision: 'promote',
      blockers: [],
      executionAuthority: 'none',
      selectedVersion: 'claim-v2',
    });
  });

  it('attaches the highest-value decision and blockers to existing Ovi certification detail idempotently', () => {
    const decision = evaluateAcquisitionImprovement({
      ...evaluation(),
      approval: null,
    });
    const packet: CertificationReviewPacket = {
      contract: 'jovie.certification/v1',
      subject: { id: plan().id, kind: 'acquisition', title: 'Candidate' },
      source: {
        repository: 'JovieInc/Jovie',
        ref: 'main',
        sha: evidence().sourceSha,
        paths: ['lib/acquisition/learning-policy.ts'],
      },
      canonicalReferences: [],
      invariantEvaluation: [],
      testsCoverage: [],
      visualProof: [],
      requiredVariants: [],
      itemMedia: [],
    };
    const reviewed = attachAcquisitionLearningReview(packet, decision);
    expect(reviewed.invariantEvaluation).toHaveLength(1);
    expect(reviewed.invariantEvaluation[0]).toMatchObject({
      status: 'blocked',
      digest: decision.approvalDigest,
      summary: expect.stringContaining('human-approval-missing-or-stale'),
    });
    expect(attachAcquisitionLearningReview(reviewed, decision)).toEqual(
      reviewed
    );
    expect(packet.invariantEvaluation).toHaveLength(0);
    expect(() =>
      attachAcquisitionLearningReview({ ...packet, source: null }, decision)
    ).toThrow('source disagree');
    expect(() =>
      attachAcquisitionLearningReview(
        { ...packet, subject: { ...packet.subject, id: 'wrong-subject' } },
        decision
      )
    ).toThrow('subject disagree');
  });
});
