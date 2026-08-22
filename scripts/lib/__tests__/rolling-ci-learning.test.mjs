import { describe, expect, it } from 'vitest';
import {
  evaluateLearningPromotion,
  LEARNING_RECEIPT_SCHEMA,
  learningReceiptMarker,
  parseLearningReceiptMarker,
  validateLearningReceipt,
} from '../rolling-ci-learning.mjs';

const head = 'a'.repeat(40);
const identity = {
  repository: 'JovieInc/Jovie',
  pr: 16337,
  head,
  check: 'CI / ci-fast',
  fingerprint: 'vitest:policy-liveness:deadlock',
};
const validReceipt = {
  schema: LEARNING_RECEIPT_SCHEMA,
  identity,
  failureKind: 'product',
  rootCauseClass: 'policy-liveness',
  currentHeadReproduction: {
    reproduced: true,
    head,
    evidence: 'fixture blocks draft creation on CI-only evidence',
  },
  minimalRepair: 'move broad verification behind draft publication',
  equivalentSurfaceSweep: {
    surfaces: ['pre-push', 'draft promotion'],
    outcome: 'only promotion consumes remote CI evidence',
  },
  deliberateRedRegression: {
    fixture: 'ci-evidence-before-draft.json',
    failsBeforeRepair: true,
    passesAfterRepair: true,
  },
  guardrailDecision: {
    warranted: true,
    reason: 'the policy dependency class can recur',
    delivery: 'same-pr',
  },
  exactHeadGreen: true,
};
const repairedFailure = {
  ...identity,
  status: 'repaired',
  repairedHead: head,
};

describe('rolling CI defect-class learning', () => {
  it('accepts a complete exact-head repaired-failure receipt', () => {
    expect(validateLearningReceipt(validReceipt, { liveHead: head })).toEqual({
      ok: true,
      errors: [],
    });
    expect(
      evaluateLearningPromotion({
        repairedFailures: [repairedFailure],
        receipts: [validReceipt],
        liveHead: head,
      })
    ).toMatchObject({ complete: true, requiredReceipts: 1 });
  });

  it('deliberate red: blocks a repaired failure without recurrence proof', () => {
    const receipt = {
      ...validReceipt,
      deliberateRedRegression: {
        fixture: 'ci-evidence-before-draft.json',
        failsBeforeRepair: false,
        passesAfterRepair: true,
      },
    };
    expect(validateLearningReceipt(receipt).errors).toContain(
      'deliberate-red before-and-after proof is required'
    );
    expect(
      evaluateLearningPromotion({
        repairedFailures: [repairedFailure],
        receipts: [receipt],
        liveHead: head,
      }).complete
    ).toBe(false);
  });

  it('blocks stale repair proof until the current head is revalidated', () => {
    expect(
      evaluateLearningPromotion({
        repairedFailures: [
          { ...repairedFailure, repairedHead: 'b'.repeat(40) },
        ],
        receipts: [validReceipt],
        liveHead: head,
      }).blockers
    ).toContainEqual(
      expect.objectContaining({
        reason: 'repair-not-revalidated-on-current-head',
      })
    );
  });

  it('routes environment failures to execution or runner repair', () => {
    const environment = {
      ...validReceipt,
      failureKind: 'environment',
      guardrailDecision: {
        warranted: false,
        reason: 'sandbox signing permission is not a product invariant',
      },
      environmentRemediation: {
        executionPathClassifier: 'macos-signing-permission',
      },
    };
    expect(validateLearningReceipt(environment).ok).toBe(true);
    expect(
      validateLearningReceipt({
        ...environment,
        guardrailDecision: {
          warranted: true,
          reason: 'incorrectly creates a product gate',
          delivery: 'same-pr',
        },
      }).errors
    ).toContain('environment and one-off failures cannot add product guards');
  });

  it('records one-offs without creating rule sprawl', () => {
    const oneOff = {
      ...validReceipt,
      failureKind: 'one-off',
      guardrailDecision: {
        warranted: false,
        reason: 'no equivalent surface or recurrence evidence',
      },
      antiRuleSprawlReason: 'single corrupted local fixture, not generalizable',
    };
    expect(validateLearningReceipt(oneOff).ok).toBe(true);
    expect(
      validateLearningReceipt({ ...oneOff, antiRuleSprawlReason: '' }).errors
    ).toContain('one-off failures require an anti-rule-sprawl reason');
  });

  it('gates only failures that have entered repaired state', () => {
    expect(
      evaluateLearningPromotion({
        repairedFailures: [{ ...repairedFailure, status: 'failed' }],
        receipts: [],
        liveHead: head,
      })
    ).toEqual({
      complete: true,
      requiredReceipts: 0,
      acceptedReceipts: 0,
      blockers: [],
    });
    expect(
      evaluateLearningPromotion({
        repairedFailures: [repairedFailure],
        receipts: [],
        liveHead: head,
      }).blockers
    ).toContainEqual(
      expect.objectContaining({ reason: 'learning-receipt-missing' })
    );
  });

  it('round-trips the durable machine-readable marker', () => {
    expect(
      parseLearningReceiptMarker(learningReceiptMarker(validReceipt))
    ).toEqual(validReceipt);
  });
});
