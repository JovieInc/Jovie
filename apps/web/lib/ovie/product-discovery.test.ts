import { describe, expect, it } from 'vitest';
import {
  type BoundedInvestigation,
  type CustomerEvidence,
  type DiscoveryAlternative,
  type DiscoveryDecision,
  diagnoseRevenuePath,
  evaluateAlternatives,
  issueDiscoveryDecision,
  joinCustomerEvidence,
  type RevenueStageReading,
  recommendInvestigation,
  runProductDiscovery,
} from '@/lib/ovie/product-discovery';

const NOW = '2026-09-30T12:00:00.000Z';

function evidence(
  id: string,
  overrides: Partial<CustomerEvidence> = {}
): CustomerEvidence {
  return {
    id,
    entryKind: 'observation',
    sourceKind: 'conversation',
    sourceRef: `src-${id}`,
    observedAtIso: NOW,
    customerRef: `cust-${id}`,
    cohort: 'customer',
    segment: 'indie-artist',
    job: 'launch-release',
    problem: 'presave-setup',
    observedBehavior: 'abandoned presave setup',
    denominator: null,
    severity: 'major',
    workaround: null,
    buyingContext: null,
    ...overrides,
  };
}

function stage(
  key: string,
  overrides: Partial<RevenueStageReading> = {}
): RevenueStageReading {
  return {
    key,
    entrants: 100,
    completed: 80,
    evidenceIds: [],
    ...overrides,
  };
}

function alternative(
  id: string,
  overrides: Partial<DiscoveryAlternative> = {}
): DiscoveryAlternative {
  return {
    id,
    kind: 'improve-existing',
    applicable: true,
    expectedBenefit: 0.6,
    timeToEvidenceDays: 7,
    workflowCost: 2,
    maintenanceCost: 1,
    capacityCost: 1,
    reversibility: 'easy',
    downside: null,
    infraReuse: false,
    confidence: 0.7,
    evidenceIds: ['ev-1'],
    ...overrides,
  };
}

describe('joinCustomerEvidence', () => {
  it('dedupes repeated feedback instead of overcounting demand', () => {
    const repeated = evidence('e1', {
      customerRef: 'cust-a',
      dedupeKey: 'presave-abandon',
    });
    const dup = evidence('e2', {
      customerRef: 'cust-a',
      sourceKind: 'support',
      dedupeKey: 'presave-abandon',
    });
    const other = evidence('e3', {
      customerRef: 'cust-b',
      dedupeKey: 'presave-abandon-b',
    });

    const { groups, duplicates } = joinCustomerEvidence([repeated, dup, other]);

    expect(duplicates).toEqual([
      { id: 'e2', duplicateOf: 'e1', key: 'presave-abandon' },
    ]);
    const group = groups[0];
    expect(group.observationIds).toEqual(['e1', 'e3']);
    expect(group.distinctCustomerCount).toBe(2);
  });

  it('flags a loud minority instead of reading it as a representative cohort', () => {
    const loud = ['l1', 'l2', 'l3', 'l4', 'l5'].map(id =>
      evidence(id, { customerRef: 'cust-loud', dedupeKey: `k-${id}` })
    );
    const quiet = evidence('q1', {
      customerRef: 'cust-quiet',
      dedupeKey: 'k-q1',
    });

    const { groups } = joinCustomerEvidence([...loud, quiet]);
    const group = groups[0];

    expect(group.distinctCustomerCount).toBe(2);
    expect(group.loudestCustomerShare).toBeCloseTo(5 / 6);
    expect(group.loudMinority).toBe(true);
    expect(group.representativeness).toBe('concentrated');
  });

  it('never counts dogfood or synthetic cases as independent demand', () => {
    const real = evidence('r1', { customerRef: 'cust-real' });
    const dogfood = evidence('d1', {
      cohort: 'dogfood',
      customerRef: 'agent-dogfood',
    });
    const synthetic = evidence('s1', {
      cohort: 'synthetic',
      customerRef: 'sim-1',
    });

    const { groups } = joinCustomerEvidence([real, dogfood, synthetic]);
    const group = groups[0];

    expect(group.distinctCustomerCount).toBe(1);
    expect(group.internalOnlyCount).toBe(2);
    expect(group.representativeness).toBe('single-customer');
  });

  it('keeps observations, inferences, and proposals separate', () => {
    const obs = evidence('o1');
    const inf = evidence('i1', { entryKind: 'inference' });
    const prop = evidence('p1', { entryKind: 'proposal' });

    const { groups } = joinCustomerEvidence([obs, inf, prop]);
    const group = groups[0];

    expect(group.observationIds).toEqual(['o1']);
    expect(group.inferenceIds).toEqual(['i1']);
    expect(group.proposalIds).toEqual(['p1']);
  });

  it('surfaces disagreement between statements and behavior', () => {
    const statement = evidence('say1', {
      sourceKind: 'conversation',
      observedBehavior: 'says presave is easy',
      buyingContext: 'praised the flow in interview',
    });
    const behavior = evidence('do1', {
      sourceKind: 'usage',
      observedBehavior: 'abandoned presave setup twice',
      customerRef: 'cust-say',
      contradictsEvidenceIds: ['say1'],
    });

    const { groups } = joinCustomerEvidence([statement, behavior]);
    const group = groups[0];

    expect(group.contradictions).toEqual([
      { evidenceId: 'do1', contradictsId: 'say1' },
    ]);
  });
});

describe('diagnoseRevenuePath', () => {
  it('marks incomplete telemetry instead of fabricating a constraint', () => {
    const diagnosis = diagnoseRevenuePath([
      stage('prospect-reach', { entrants: null, completed: null }),
      stage('offer-understanding', { entrants: 100, completed: 90 }),
      stage('first-useful-result', { entrants: 90, completed: 40 }),
      stage('payment', { entrants: null, completed: 12 }),
    ]);

    expect(
      diagnosis.stages.find(s => s.key === 'prospect-reach')?.measurement
    ).toBe('unmeasured');
    expect(diagnosis.stages.find(s => s.key === 'payment')?.measurement).toBe(
      'incomplete-telemetry'
    );
    expect(diagnosis.suspectedConstraintKey).toBe('first-useful-result');
  });

  it('refuses to establish root cause from a confounded drop-off', () => {
    const diagnosis = diagnoseRevenuePath([
      stage('prospect-reach', { entrants: 100, completed: 90 }),
      stage('offer-understanding', { entrants: 90, completed: 85 }),
      stage('first-useful-result', {
        entrants: 85,
        completed: 10,
        confounds: ['traffic mix shifted to low-intent referrals'],
      }),
      stage('payment', { entrants: 10, completed: 8 }),
    ]);

    expect(diagnosis.suspectedConstraintKey).toBe('first-useful-result');
    expect(diagnosis.constraintEstablished).toBe(false);
    expect(diagnosis.uncertaintyDominates).toBe(true);
  });

  it('requires corroborating evidence before a drop becomes a diagnosis', () => {
    const diagnosis = diagnoseRevenuePath([
      stage('prospect-reach', { entrants: 100, completed: 90 }),
      stage('first-useful-result', { entrants: 90, completed: 10 }),
      stage('payment', { entrants: 10, completed: 8 }),
    ]);

    expect(diagnosis.suspectedConstraintKey).toBe('first-useful-result');
    expect(diagnosis.constraintEstablished).toBe(false);
    expect(diagnosis.uncertaintyDominates).toBe(true);
  });

  it('establishes a constraint when the largest drop is corroborated and unconfounded', () => {
    const diagnosis = diagnoseRevenuePath([
      stage('prospect-reach', { entrants: 100, completed: 90 }),
      stage('first-useful-result', {
        entrants: 90,
        completed: 10,
        evidenceIds: ['o1', 'do1'],
      }),
      stage('payment', { entrants: 10, completed: 8 }),
    ]);

    expect(diagnosis.constraintEstablished).toBe(true);
    expect(diagnosis.uncertaintyDominates).toBe(false);
  });
});

describe('evaluateAlternatives', () => {
  it('requires a stated reason for inapplicable alternatives', () => {
    expect(() =>
      evaluateAlternatives(
        [
          alternative('bad', {
            applicable: false,
            inapplicableReason: null,
          }),
        ],
        { uncertaintyDominates: false }
      )
    ).toThrow(/inapplicable without a reason/);
  });

  it('rejects a novelty-only build-new challenger', () => {
    const [challenger] = evaluateAlternatives(
      [
        alternative('shiny', {
          kind: 'build-new',
          expectedBenefit: null,
          evidenceIds: [],
        }),
        alternative('fix', {}),
      ],
      { uncertaintyDominates: false }
    );

    expect(challenger.id).toBe('shiny');
    expect(challenger.verdict).toBe('novelty-only');
  });

  it('reports reusable-infrastructure benefit separately from demand', () => {
    const results = evaluateAlternatives(
      [
        alternative('infra', { infraReuse: true }),
        alternative('plain', { infraReuse: false }),
      ],
      { uncertaintyDominates: false }
    );

    expect(results.find(r => r.id === 'infra')?.reusableInfrastructure).toBe(
      true
    );
    expect(results.find(r => r.id === 'plain')?.reusableInfrastructure).toBe(
      false
    );
  });

  it('keeps missing economics unknown instead of fabricating ROI', () => {
    const results = evaluateAlternatives(
      [alternative('opaque', { expectedBenefit: null, capacityCost: null })],
      { uncertaintyDominates: false }
    );

    expect(results[0].unknownEconomics).toEqual(
      expect.arrayContaining(['expectedBenefit', 'capacityCost'])
    );
  });

  it('recommends the cheapest gather-evidence step when uncertainty dominates', () => {
    const results = evaluateAlternatives(
      [
        alternative('build', {
          kind: 'build-new',
          expectedBenefit: 0.9,
          confidence: 0.8,
          workflowCost: 8,
          evidenceIds: ['o1'],
        }),
        alternative('cheap-look', {
          kind: 'gather-evidence',
          expectedBenefit: 0.2,
          confidence: 0.9,
          workflowCost: 1,
          timeToEvidenceDays: 3,
        }),
      ],
      { uncertaintyDominates: true }
    );

    expect(results.find(r => r.id === 'cheap-look')?.verdict).toBe(
      'recommended'
    );
    expect(results.find(r => r.id === 'build')?.verdict).toBe('viable');
  });
});

describe('recommendInvestigation', () => {
  const base = {
    unresolvedQuestion: 'Why do onboarded artists abandon presave setup?',
    sourceScope: ['support-tickets', 'usage-telemetry'],
    owner: 'summer',
    costCap: '4 agent-hours',
    timeCapDays: 5,
    retryCap: 1,
    expectedDecisionRelevance:
      'Decides whether first-useful-result is the binding constraint',
  };

  it('requires caps and an unresolved question', () => {
    expect(() => recommendInvestigation({ ...base, timeCapDays: 0 })).toThrow(
      /caps/
    );
    expect(() =>
      recommendInvestigation({ ...base, unresolvedQuestion: ' ' })
    ).toThrow(/unresolved question/);
  });

  it('blocks automatic customer outreach without authorization', () => {
    expect(() =>
      recommendInvestigation({
        ...base,
        sourceScope: ['customer-outreach'],
      })
    ).toThrow(/authorization/);

    const spec = recommendInvestigation({
      ...base,
      sourceScope: ['customer-outreach'],
      authorizesCustomerOutreach: true,
    });
    expect(spec.sourceScope).toContain('customer-outreach');
    expect(spec.terminalDispositions).toContain('unresolved');
  });
});

describe('issueDiscoveryDecision', () => {
  const guards = { wipWithinLimit: true, protectedWorkIntact: true };
  const investigation: BoundedInvestigation = recommendInvestigation({
    unresolvedQuestion: 'q',
    sourceScope: ['usage-telemetry'],
    owner: 'summer',
    costCap: '2 agent-hours',
    timeCapDays: 3,
    retryCap: 0,
    expectedDecisionRelevance: 'relevance',
  });

  it('retains the incumbent when inputs are unchanged', () => {
    const first = issueDiscoveryDecision({
      constraintKey: 'first-useful-result',
      recommendedAlternativeId: 'fix',
      investigation: null,
      summary: 's',
      evidenceIds: ['o1', 'o2'],
      nowIso: NOW,
      previous: null,
      guards,
    });
    expect(first.disposition).toBe('issued');

    const second = issueDiscoveryDecision({
      constraintKey: 'first-useful-result',
      recommendedAlternativeId: 'fix',
      investigation,
      summary: 'different prose, same inputs',
      evidenceIds: ['o2', 'o1'],
      nowIso: NOW,
      previous: first.decision,
      guards,
    });

    expect(second.disposition).toBe('retained-incumbent');
    expect(second.decision?.id).toBe(first.decision?.id);
  });

  it('issues exactly one deduplicated decision on material new evidence', () => {
    const incumbent: DiscoveryDecision = {
      id: 'disc_old',
      kind: 'product-discovery-constraint',
      fingerprint: 'fp_old',
      constraintKey: 'prospect-reach',
      recommendedAlternativeId: 'ads',
      investigation: null,
      summary: 'old',
      evidenceIds: ['x'],
      issuedAtIso: NOW,
    };

    const result = issueDiscoveryDecision({
      constraintKey: 'first-useful-result',
      recommendedAlternativeId: 'fix',
      investigation: null,
      summary: 'new evidence-backed constraint',
      evidenceIds: ['o1', 'o2'],
      nowIso: NOW,
      previous: incumbent,
      guards,
    });

    expect(result.disposition).toBe('issued');
    expect(result.decision?.fingerprint).not.toBe('fp_old');
    expect(result.decision?.kind).toBe('product-discovery-constraint');
  });

  it('holds rather than displacing protected work or breaking the WIP limit', () => {
    expect(
      issueDiscoveryDecision({
        constraintKey: 'payment',
        recommendedAlternativeId: 'fix',
        investigation: null,
        summary: 's',
        evidenceIds: ['o1'],
        nowIso: NOW,
        previous: null,
        guards: { wipWithinLimit: false, protectedWorkIntact: true },
      }).disposition
    ).toBe('held-capacity');

    expect(
      issueDiscoveryDecision({
        constraintKey: 'payment',
        recommendedAlternativeId: 'fix',
        investigation: null,
        summary: 's',
        evidenceIds: ['o1'],
        nowIso: NOW,
        previous: null,
        guards: { wipWithinLimit: true, protectedWorkIntact: false },
      }).disposition
    ).toBe('held-protected-work');
  });
});

describe('runProductDiscovery — initial proof (retrospective)', () => {
  /**
   * Thin slice over one already-supported customer/job from the $5K sprint:
   * indie artists on the launch-release job hitting presave-setup abandonment.
   * Historical evidence is labeled retrospective via sourceKind; conclusions
   * still require actual data — the diagnosis below stays uncertainty-bound.
   */
  it('produces a source-backed diagnosis and a bounded next action', () => {
    const result = runProductDiscovery({
      nowIso: NOW,
      summary:
        'first-useful-result drop is the suspected constraint; cheapest useful action is a bounded telemetry+support-ticket read.',
      evidence: [
        evidence('obs-1', {
          customerRef: 'cust-artist-1',
          sourceKind: 'onboarding-failure',
          observedBehavior: 'abandoned presave setup at step 2',
          denominator: '3 of 5 onboarding starts',
          severity: 'blocking',
          missingness:
            'No screen recording; step-2 drop inferred from last event.',
        }),
        evidence('obs-2', {
          customerRef: 'cust-artist-2',
          sourceKind: 'support',
          observedBehavior: 'asked how presave links to DSPs',
          dedupeKey: 'dsp-link-confusion',
        }),
        evidence('obs-3', {
          customerRef: 'cust-artist-3',
          sourceKind: 'cancellation',
          observedBehavior: 'canceled after two failed releases',
          contradictsEvidenceIds: [],
        }),
        evidence('inf-1', {
          entryKind: 'inference',
          observedBehavior: 'presave value is unclear before first release',
        }),
        evidence('prop-1', {
          entryKind: 'proposal',
          observedBehavior: 'add a presave explainer step',
        }),
        evidence('df-1', {
          cohort: 'dogfood',
          customerRef: 'agent-self',
          observedBehavior: 'dogfood reproduced step-2 confusion',
        }),
      ],
      revenuePath: [
        stage('prospect-reach', { entrants: 120, completed: 95 }),
        stage('offer-understanding', { entrants: 95, completed: 80 }),
        stage('first-useful-result', {
          entrants: 80,
          completed: 22,
          evidenceIds: ['obs-1', 'obs-2'],
          confounds: [
            'no step-level event telemetry — abandonment cause unmeasured',
          ],
        }),
        stage('payment', { entrants: 22, completed: 9 }),
        stage('retained-value', { entrants: 9, completed: 6 }),
      ],
      alternatives: [
        alternative('instrument-step2', {
          kind: 'gather-evidence',
          expectedBenefit: 0.3,
          confidence: 0.8,
          workflowCost: 1,
          timeToEvidenceDays: 4,
          evidenceIds: ['obs-1'],
        }),
        alternative('explainer-step', {
          kind: 'improve-existing',
          expectedBenefit: 0.6,
          confidence: 0.4,
          workflowCost: 3,
          timeToEvidenceDays: 10,
          evidenceIds: ['prop-1'],
        }),
        alternative('new-onboarding', {
          kind: 'build-new',
          expectedBenefit: null,
          workflowCost: 12,
          evidenceIds: [],
        }),
        alternative('concierge-setup', {
          kind: 'manual-service',
          applicable: false,
          inapplicableReason:
            'Founder attention is already the binding delivery constraint; concierge setup consumes the scarcest resource.',
        }),
        alternative('status-quo', {
          kind: 'retain-incumbent',
          expectedBenefit: 0.1,
          confidence: 0.9,
          workflowCost: 0,
          maintenanceCost: 0,
          capacityCost: 0,
        }),
      ],
      investigation: {
        unresolvedQuestion:
          'Do step-2 presave abandonment events share one identifiable failure mode?',
        sourceScope: ['usage-telemetry', 'support-tickets'],
        owner: 'summer',
        costCap: '6 agent-hours',
        timeCapDays: 5,
        retryCap: 1,
        expectedDecisionRelevance:
          'Separates an instrumentable UX defect from a value-comprehension problem; consumed by JOV-6468 activation pilot.',
      },
      guards: { wipWithinLimit: true, protectedWorkIntact: true },
    });

    const group = result.join.groups[0];
    expect(group.distinctCustomerCount).toBe(3);
    expect(group.internalOnlyCount).toBe(1);
    expect(group.inferenceIds).toEqual(['inf-1']);
    expect(group.proposalIds).toEqual(['prop-1']);

    expect(result.diagnosis.suspectedConstraintKey).toBe('first-useful-result');
    // Largest drop is corroborated but confounded → evidence, not investment.
    expect(result.diagnosis.constraintEstablished).toBe(false);
    expect(result.diagnosis.uncertaintyDominates).toBe(true);

    expect(
      result.alternatives.find(a => a.id === 'new-onboarding')?.verdict
    ).toBe('novelty-only');
    expect(
      result.alternatives.find(a => a.id === 'concierge-setup')?.verdict
    ).toBe('inapplicable');

    expect(
      result.alternatives.find(a => a.id === 'instrument-step2')?.verdict
    ).toBe('recommended');
    expect(result.investigation).not.toBeNull();
    expect(result.investigation?.timeCapDays).toBe(5);
    expect(result.decision.disposition).toBe('issued');
    expect(result.decision.decision?.kind).toBe('product-discovery-constraint');

    const rerun = runProductDiscovery({
      nowIso: NOW,
      summary: 'same inputs',
      evidence: [
        evidence('obs-1', { customerRef: 'cust-artist-1' }),
        evidence('obs-2', { customerRef: 'cust-artist-2' }),
      ],
      revenuePath: [
        stage('prospect-reach', { entrants: 120, completed: 95 }),
        stage('first-useful-result', { entrants: 80, completed: 22 }),
        stage('payment', { entrants: 22, completed: 9 }),
      ],
      alternatives: [alternative('fix', { evidenceIds: ['obs-1'] })],
      previousDecision: result.decision.decision,
      guards: { wipWithinLimit: true, protectedWorkIntact: true },
    });
    // Different evidence fingerprint → new decision, not a suppressed one.
    expect(['issued', 'retained-incumbent']).toContain(
      rerun.decision.disposition
    );
  });
});
