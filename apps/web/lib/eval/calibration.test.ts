import { describe, expect, it } from 'vitest';

import {
  assertJudgeCalibrationGate,
  CalibrationGateError,
  computeCohensKappa,
  computeHoldoutKappa,
  DEFAULT_KAPPA_THRESHOLD,
  type HumanHoldoutSet,
  loadHumanHoldoutSet,
  pairHoldoutLabels,
  parseHumanHoldoutSet,
  runJudgeCalibrationGate,
} from './calibration';

function makeHoldout(items: HumanHoldoutSet['items']): HumanHoldoutSet {
  return {
    schemaVersion: 1,
    labeledAt: '2026-06-27T12:00:00.000Z',
    items,
  };
}

describe('parseHumanHoldoutSet', () => {
  it('parses a valid holdout payload', () => {
    const holdout = parseHumanHoldoutSet({
      schemaVersion: 1,
      labeledAt: '2026-06-27T12:00:00.000Z',
      items: [
        {
          id: 'a',
          caseId: 'case-a',
          humanLabel: 'pass',
        },
      ],
    });

    expect(holdout.items).toHaveLength(1);
    expect(holdout.items[0]?.humanLabel).toBe('pass');
  });

  it('rejects duplicate ids and invalid labels', () => {
    expect(() =>
      parseHumanHoldoutSet({
        schemaVersion: 1,
        labeledAt: '2026-06-27T12:00:00.000Z',
        items: [
          { id: 'dup', caseId: 'one', humanLabel: 'pass' },
          { id: 'dup', caseId: 'two', humanLabel: 'fail' },
        ],
      })
    ).toThrow(/Duplicate holdout id/);

    expect(() =>
      parseHumanHoldoutSet({
        schemaVersion: 1,
        labeledAt: '2026-06-27T12:00:00.000Z',
        items: [{ id: 'a', caseId: 'case-a', humanLabel: 'maybe' }],
      })
    ).toThrow(/invalid humanLabel/);
  });
});

describe('loadHumanHoldoutSet', () => {
  it('loads the bundled human-labeled holdout fixture', () => {
    const holdout = loadHumanHoldoutSet();

    expect(holdout.schemaVersion).toBe(1);
    expect(holdout.items.length).toBeGreaterThanOrEqual(4);
    expect(
      holdout.items.every(
        item => item.humanLabel === 'pass' || item.humanLabel === 'fail'
      )
    ).toBe(true);
  });
});

describe('computeCohensKappa', () => {
  it('returns 1 for perfect agreement', () => {
    const result = computeCohensKappa(
      ['pass', 'pass', 'fail', 'fail'],
      ['pass', 'pass', 'fail', 'fail']
    );

    expect(result.kappa).toBe(1);
    expect(result.observedAgreement).toBe(1);
  });

  it('returns 0 for chance-level disagreement on balanced labels', () => {
    const result = computeCohensKappa(
      ['pass', 'pass', 'fail', 'fail'],
      ['pass', 'fail', 'pass', 'fail']
    );

    expect(result.kappa).toBeCloseTo(0, 5);
  });

  it('returns negative kappa for worse-than-chance disagreement', () => {
    const result = computeCohensKappa(
      ['pass', 'pass', 'fail', 'fail'],
      ['fail', 'fail', 'pass', 'pass']
    );

    expect(result.kappa).toBeLessThan(0);
    expect(result.observedAgreement).toBe(0);
  });
});

describe('pairHoldoutLabels', () => {
  it('pairs by holdout id and falls back to caseId', () => {
    const holdout = makeHoldout([
      { id: 'by-id', caseId: 'case-a', humanLabel: 'pass' },
      { id: 'by-case', caseId: 'case-b', humanLabel: 'fail' },
    ]);

    const { paired, missingJudgeLabels } = pairHoldoutLabels(holdout, {
      'by-id': 'pass',
      'case-b': 'fail',
    });

    expect(missingJudgeLabels).toEqual([]);
    expect(paired).toHaveLength(2);
    expect(computeHoldoutKappa(paired).kappa).toBe(1);
  });
});

describe('runJudgeCalibrationGate', () => {
  it('passes when judge labels align with human holdout labels', () => {
    const holdout = loadHumanHoldoutSet();
    const judgeLabels = Object.fromEntries(
      holdout.items.map(item => [item.id, item.humanLabel])
    );

    const result = runJudgeCalibrationGate({ holdout, judgeLabels });

    expect(result.passed).toBe(true);
    expect(result.kappa).toBe(1);
    expect(result.threshold).toBe(DEFAULT_KAPPA_THRESHOLD);
    expect(result.disagreements).toEqual([]);
  });

  it('fails when kappa falls below the default threshold', () => {
    const holdout = makeHoldout([
      { id: 'a', caseId: 'case-a', humanLabel: 'pass' },
      { id: 'b', caseId: 'case-b', humanLabel: 'pass' },
      { id: 'c', caseId: 'case-c', humanLabel: 'fail' },
      { id: 'd', caseId: 'case-d', humanLabel: 'fail' },
    ]);

    const result = runJudgeCalibrationGate({
      holdout,
      judgeLabels: {
        a: 'pass',
        b: 'fail',
        c: 'pass',
        d: 'fail',
      },
    });

    expect(result.passed).toBe(false);
    expect(result.kappa).toBeCloseTo(0, 5);
    expect(result.disagreements).toHaveLength(2);
  });

  it('throws when judge labels are missing for holdout rows', () => {
    const holdout = makeHoldout([
      { id: 'a', caseId: 'case-a', humanLabel: 'pass' },
    ]);

    expect(() =>
      runJudgeCalibrationGate({
        holdout,
        judgeLabels: {},
      })
    ).toThrow(/Missing judge labels/);
  });
});

describe('assertJudgeCalibrationGate', () => {
  it('returns the gate result when calibration passes', () => {
    const holdout = makeHoldout([
      { id: 'a', caseId: 'case-a', humanLabel: 'pass' },
      { id: 'b', caseId: 'case-b', humanLabel: 'fail' },
    ]);

    const result = assertJudgeCalibrationGate({
      holdout,
      judgeLabels: { a: 'pass', b: 'fail' },
    });

    expect(result.passed).toBe(true);
  });

  it('throws CalibrationGateError when kappa is below threshold', () => {
    const holdout = makeHoldout([
      { id: 'a', caseId: 'case-a', humanLabel: 'pass' },
      { id: 'b', caseId: 'case-b', humanLabel: 'pass' },
      { id: 'c', caseId: 'case-c', humanLabel: 'fail' },
      { id: 'd', caseId: 'case-d', humanLabel: 'fail' },
    ]);

    expect(() =>
      assertJudgeCalibrationGate({
        holdout,
        judgeLabels: {
          a: 'pass',
          b: 'fail',
          c: 'pass',
          d: 'fail',
        },
        threshold: 0.6,
      })
    ).toThrow(CalibrationGateError);
  });
});
