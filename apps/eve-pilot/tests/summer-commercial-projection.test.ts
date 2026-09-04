import { describe, expect, it } from 'vitest';
import {
  projectSummerCommercial,
  summerCommercialSnapshotSchema,
} from '../agent/lib/summer-commercial-projection';

import { m, NOW, snapshot } from './commercial-fixture';

const project = (input = snapshot()) => projectSummerCommercial(input, NOW);

describe('commercial recommendation boundary', () => {
  it('records losses without suppressing unrelated safe work', () => {
    const input = snapshot();
    input.availableCashAfterObligationsCents = m(-50000);
    input.candidates[0].contributionMarginCents = m(-100);
    expect(project(input).recommendationKind).toBe(
      'bounded_evidence_gathering'
    );
    input.candidates.push({
      ...input.candidates[0],
      id: 'recovery',
      kind: 'control-recovery',
    });
    expect(project(input).selectedCandidateId).toBe('recovery');
    expect(project(input).financials.availableCashAfterObligationsCents).toBe(
      -50000
    );
  });
  it('recommends useful zero-spend infrastructure while preserving spending and WIP gates', () => {
    const input = snapshot();
    input.candidates[0] = {
      ...input.candidates[0],
      kind: 'infrastructure',
      repeatedUsefulJobs: m(8),
      founderMinutesSaved: m(120),
      implementationCostCents: m(0),
      ongoingCostCents: m(0),
      daysToBenefit: m(1),
    };
    expect(project(input).recommendationKind).toBe('bounded_infrastructure');
    input.candidates[0].implementationCostCents = m(1);
    expect(project(input).verdict).toBe('hold');
    input.candidates[0].implementationCostCents = m(0);
    input.activeCommercialId = 'other-active-experiment';
    expect(project(input).recommendationKind).toBe('bounded_infrastructure');
    expect(project(input).unknowns).toContain(
      'active_experiment_requires_review_before_replacement'
    );
  });
  it('lets stronger LYB paid value beat Jovie without a product preference', () => {
    const input = snapshot();
    input.candidates.push({
      ...input.candidates[0],
      id: 'lyb',
      product: 'logyourbody',
      lybCanaryPassed: true,
      paidValueCompletions: m(3),
      collectedCashCents: m(90000),
    });
    expect(project(input).selectedCandidateId).toBe('lyb');
    input.candidates.reverse();
    expect(project(input).selectedCandidateId).toBe('lyb');
  });
  it.each([
    'held',
    'noAuto',
    'safetyCleared',
    'consentCleared',
    'readinessCleared',
  ] as const)('enforces %s independently of paid demand', gate => {
    const input = snapshot();
    input.candidates[0][gate] = gate === 'held' || gate === 'noAuto';
    expect(project(input).verdict).toBe('hold');
  });
  it('retains the LYB canary gate', () => {
    const input = snapshot();
    input.candidates[0].product = 'logyourbody';
    expect(project(input).verdict).toBe('hold');
  });
  it('keeps salary sustainability and cash headroom UNKNOWN without blocking safe learning', () => {
    const result = project();
    expect(result.selectedCandidateId).toBe('thumbnails');
    expect(result.salary.sustainability).toBe('UNKNOWN');
    expect(result.salary.annualPersonalSalaryGoalsDollars).toEqual([
      32000, 50000, 70000, 100000, 150000, 200000,
    ]);
    expect(result.salary.reinvestUpTo100Percent).toContain('optional');
    expect(result.cost.authorizedMonthlyCeilingCents).toBe(100000);
    expect(result.cost.headroom).toBe('UNKNOWN');
    expect(result.financials.recurringMrrCents).toBe('UNKNOWN');
    expect(result.financials.collectedCashCents).toBe(500000);
    expect(result.unknowns).toContain('employerCompensationCostCents');
    expect(result.authority).toEqual({
      dispatchAuthority: 'none',
      allowedMutations: [],
    });
  });
  it('recommends bounded zero-spend evidence gathering before paid value exists', () => {
    const input = snapshot();
    input.candidates[0].paidValueCompletions = null;
    expect(project(input).recommendationKind).toBe(
      'bounded_evidence_gathering'
    );
    input.candidates[0].incrementalSpendCents = m(1);
    expect(project(input).verdict).toBe('hold');
    input.candidates[0].incrementalSpendCents = null;
    expect(project(input).verdict).toBe('hold');
  });
  it('keeps total founder effort within four hours including other duties', () => {
    const input = snapshot();
    input.recordedFounderMinutesPerDay = m(220);
    expect(project(input).verdict).toBe('hold');
    input.recordedFounderMinutesPerDay = null;
    expect(project(input).verdict).toBe('hold');
  });
  it('requests a tradeoff instead of inventing ROI weights', () => {
    const input = snapshot();
    input.candidates.push({
      ...input.candidates[0],
      id: 'profiles',
      paidValueCompletions: m(5),
      daysToCash: m(5),
    });
    expect(project(input).verdict).toBe('hold');
    expect(project(input).frontierCandidateIds).toHaveLength(2);
    input.activeCommercialId = 'profiles';
    expect(project(input).selectedCandidateId).toBe('profiles');
    input.candidates[1].held = true;
    expect(project(input).verdict).toBe('hold');
  });
  it('protects paid rescue and control recovery independent of commercial evidence', () => {
    const input = snapshot();
    input.candidates.push(
      { ...input.candidates[0], id: 'recovery', kind: 'control-recovery' },
      { ...input.candidates[0], id: 'rescue', kind: 'paid-rescue' }
    );
    input.recordedFounderMinutesPerDay = null;
    expect(project(input).selectedCandidateId).toBe('rescue');
    input.candidates.pop();
    expect(project(input).selectedCandidateId).toBe('recovery');
    expect(project(input).recommendationKind).toBe('protected_work');
  });
  it('retains repeated useful infrastructure gains without fabricating demand or ROI', () => {
    const input = snapshot();
    input.candidates.push({
      ...input.candidates[0],
      id: 'shipping',
      kind: 'infrastructure',
      repeatedUsefulJobs: m(8),
      founderMinutesSaved: m(120),
      implementationCostCents: m(0),
      ongoingCostCents: m(0),
      daysToBenefit: m(1),
    });
    expect(project(input).evidenceBackedInfrastructureIds).toEqual([
      'shipping',
    ]);
    expect(project(input).selectedCandidateId).toBe('thumbnails');
    input.candidates[1].repeatedUsefulJobs = m(1);
    expect(project(input).evidenceBackedInfrastructureIds).toEqual([]);
    input.candidates[1].repeatedUsefulJobs = null;
    expect(project(input).evidenceBackedInfrastructureIds).toEqual([]);
  });
  it.each([
    'hypothesis',
    'stale',
    'future',
    'missing',
  ])('excludes %s source records without coercing unknowns to zero', kind => {
    const input = snapshot();
    if (kind === 'hypothesis') input.sources[0].basis = 'hypothesis';
    if (kind === 'stale') input.sources[0].observedAt = '2026-09-01T00:00:00Z';
    if (kind === 'future') input.sources[0].observedAt = '2099-01-01T00:00:00Z';
    if (kind === 'missing') input.sources = [];
    expect(project(input).verdict).toBe('hold');
    expect(project(input).financials.collectedCashCents).toBe('UNKNOWN');
  });
  it('rejects duplicate identities and unsafe numeric claims', () => {
    const input = snapshot();
    input.sources.push(input.sources[0]);
    expect(summerCommercialSnapshotSchema.safeParse(input).success).toBe(false);
    input.sources.pop();
    input.candidates.push(input.candidates[0]);
    expect(() => project(input)).toThrow();
    input.candidates.pop();
    input.collectedCashCents = m(-1);
    expect(() => project(input)).toThrow();
  });
  it('does not double-count snapshots and binds changes to a different digest', () => {
    const input = snapshot();
    expect(project(input)).toEqual(project(input));
    const before = project(input);
    input.candidates[0].held = true;
    const after = project(input);
    expect(after.evidenceDigest).not.toBe(before.evidenceDigest);
    expect(after.verdict).toBe('hold');
    expect(after.financials.collectedCashCents).toBe(500000);
  });
});
