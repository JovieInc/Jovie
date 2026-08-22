import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateLearningGateInput } from '../../rolling-ci-learning-gate.mjs';
import {
  LEARNING_RECEIPT_SCHEMA,
  learningReceiptKey,
  learningReceiptMarker,
} from '../rolling-ci-learning.mjs';

const head = 'a'.repeat(40);
const identity = {
  repository: 'JovieInc/Jovie',
  pr: 16340,
  head,
  check: 'CI / Unit Tests',
  fingerprint: 'vitest:rolling-ci:fixture',
};
const repairedFailure = {
  ...identity,
  failureKey: learningReceiptKey(identity),
  status: 'repaired',
  repairedHead: head,
};
const receipt = {
  schema: LEARNING_RECEIPT_SCHEMA,
  identity,
  failureKind: 'product',
  rootCauseClass: 'missing-dedupe',
  currentHeadReproduction: {
    reproduced: true,
    head,
    evidence: 'duplicate failure fixture reproduced on current head',
  },
  minimalRepair: 'deduplicate the exact failure fingerprint',
  equivalentSurfaceSweep: {
    surfaces: ['workflow_run', 'check_suite'],
    outcome: 'both paths share the same fingerprint key',
  },
  deliberateRedRegression: {
    fixture: 'duplicate-delivery.json',
    failsBeforeRepair: true,
    passesAfterRepair: true,
  },
  guardrailDecision: {
    warranted: true,
    reason: 'duplicate delivery is a reusable event invariant',
    delivery: 'same-pr',
  },
  exactHeadGreen: true,
};

describe('rolling CI learning promotion gate', () => {
  it('accepts a durable comment receipt for the repaired exact head', () => {
    expect(
      evaluateLearningGateInput({
        liveHead: head,
        repairedFailures: [repairedFailure],
        learningComments: [learningReceiptMarker(receipt)],
      })
    ).toMatchObject({ complete: true, acceptedReceipts: 1 });
  });

  it('exits red when a repaired failure has no durable receipt', () => {
    const script = resolve(
      import.meta.dirname,
      '../../rolling-ci-learning-gate.mjs'
    );
    const child = spawnSync(process.execPath, [script], {
      input: JSON.stringify({
        liveHead: head,
        repairedFailures: [repairedFailure],
        learningComments: [],
      }),
      encoding: 'utf8',
    });
    expect(child.status).toBe(1);
    expect(JSON.parse(child.stdout)).toMatchObject({
      complete: false,
      blockers: [{ reason: 'learning-receipt-missing' }],
    });
  });

  it('stays green when no failure has been repaired', () => {
    expect(
      evaluateLearningGateInput({
        liveHead: head,
        repairedFailures: [{ ...repairedFailure, status: 'superseded' }],
      })
    ).toEqual({
      complete: true,
      requiredReceipts: 0,
      acceptedReceipts: 0,
      blockers: [],
    });
  });
});
