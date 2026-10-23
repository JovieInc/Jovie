import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCRIPT_CONTRACT_VITEST_TESTS } from '../../ci-fast-lanes.mjs';
import {
  assertFloorsNotLowered,
  evaluateMutationScore,
  loadMutationScoreBaseline,
} from '../mutation-score-floor.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const BASELINE_PATH = resolve(
  REPO_ROOT,
  'scripts/mutation-score-baseline.json'
);

/** Measured Mutation Diff scores. Floors in the file are one point lower. */
const MEASURED = {
  'app/api/billing/health/route.ts': {
    measured: 44.6,
    valid: 305,
    runId: 39691992741,
  },
  'app/api/stripe/webhooks/route.ts': {
    measured: 68.9,
    valid: 193,
    runId: 39691992741,
  },
  'app/api/webhooks/stripe-merch/route.ts': {
    measured: 39.4,
    valid: 104,
    runId: 39691992741,
  },
  'app/api/webhooks/stripe-tips/route.ts': {
    measured: 58.4,
    valid: 166,
    runId: 39691992741,
  },
  'lib/auth/proxy-request-handler.ts': {
    measured: 68.4,
    valid: 187,
    runId: 39862439698,
  },
  'lib/billing/webhook-replay.ts': {
    measured: 69.1,
    valid: 136,
    runId: 39691992741,
  },
  'lib/claim/redirect-origin.ts': {
    measured: 47.1,
    valid: 87,
    runId: 39873145330,
  },
  'lib/stripe/dunning.ts': {
    measured: 12.6,
    valid: 135,
    runId: 39889081061,
  },
  'lib/stripe/startup-validation.ts': {
    measured: 90.5,
    valid: 63,
    runId: 39814455991,
  },
  'lib/stripe/test-price-contract.ts': {
    measured: 83.9,
    valid: 118,
    runId: 39814455991,
  },
  'lib/stripe/webhooks/base-handler.ts': {
    measured: 55.7,
    valid: 88,
    runId: 39691992741,
  },
  'lib/stripe/webhooks/handlers/payment-handler.ts': {
    measured: 77.1,
    valid: 218,
    runId: 39689355537,
  },
  'proxy.ts': {
    measured: 56.7,
    valid: 150,
    runId: 39873145330,
  },
};

describe('mutation score floor', () => {
  it('runs from the structural script contract lane', () => {
    expect(SCRIPT_CONTRACT_VITEST_TESTS).toContain(
      'scripts/lib/__tests__/mutation-score-floor.test.mjs'
    );
  });

  it('pins floors one point under the measured artifact scores', () => {
    const baseline = loadMutationScoreBaseline(BASELINE_PATH);
    expect(Object.keys(baseline.files).sort()).toEqual(
      Object.keys(MEASURED).sort()
    );
    for (const [file, expected] of Object.entries(MEASURED)) {
      const entry = baseline.files[file];
      expect(entry.measured, file).toBe(expected.measured);
      expect(entry.valid, file).toBe(expected.valid);
      expect(entry.runId, file).toBe(expected.runId);
      expect(entry.floor, file).toBe(
        Math.round((expected.measured - 1) * 10) / 10
      );
      const atFloor = evaluateMutationScore(
        file,
        entry.floor,
        entry.valid,
        baseline
      );
      const measured = evaluateMutationScore(
        file,
        entry.measured,
        entry.valid,
        baseline
      );
      const under = evaluateMutationScore(
        file,
        Math.round((entry.floor - 0.1) * 10) / 10,
        entry.valid,
        baseline
      );
      expect(atFloor.ok, file).toBe(true);
      expect(measured.ok, file).toBe(true);
      expect(under.ok, file).toBe(false);
    }
  });

  it('refuses a lower or removed floor and accepts a higher one', () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    const anchor = {
      files: Object.fromEntries(
        Object.entries(MEASURED).map(([file, expected]) => [
          file,
          { floor: Math.round((expected.measured - 1) * 10) / 10 },
        ])
      ),
    };
    expect(() => assertFloorsNotLowered(baseline, anchor)).not.toThrow();

    const raised = structuredClone(baseline);
    raised.files['lib/stripe/dunning.ts'].floor = 12;
    expect(() => assertFloorsNotLowered(raised, baseline)).not.toThrow();

    const lowered = structuredClone(baseline);
    lowered.files['lib/stripe/dunning.ts'].floor = 11;
    expect(() => assertFloorsNotLowered(lowered, baseline)).toThrow(
      'can only go up'
    );

    const removed = structuredClone(baseline);
    delete removed.files['proxy.ts'];
    expect(() => assertFloorsNotLowered(removed, baseline)).toThrow(
      'proxy.ts: floor removed'
    );
  });

  it('leaves a file without a floor advisory', () => {
    const baseline = loadMutationScoreBaseline(BASELINE_PATH);
    expect(evaluateMutationScore('lib/auth/policy.ts', 0, 1, baseline)).toEqual(
      {
        enforced: false,
        file: 'lib/auth/policy.ts',
        score: 0,
        valid: 1,
      }
    );
  });
});
