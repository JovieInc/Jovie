import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  admissionRunReceipt,
  parseAdmissionHistory,
} from '../backlog-orchestrator.mjs';

const NOW = '2026-08-09T18:00:00.000Z';

function teamScan(team, counts) {
  return {
    team,
    status: 'blocked',
    stage: 'selection',
    admissionScan: {
      coverage: { complete: true },
      counts: { unclassified: 0, ...counts },
    },
    mutations: 0,
  };
}

describe('aggregate Symphony admission receipt', () => {
  it('fails closed on malformed durable retry history', () => {
    assert.throws(() => parseAdmissionHistory('{not-json'));
    assert.throws(
      () => parseAdmissionHistory({ schema: 'wrong', teams: {} }),
      /invalid-admission-history/
    );
  });

  it('closes the full multi-team denominator with zero unclassified', () => {
    const receipt = admissionRunReceipt(
      [
        teamScan('JOV', {
          totalEvaluated: 1001,
          eligible: 40,
          queued: 20,
          claimed: 10,
          deferred: 900,
          rejected: 31,
        }),
        teamScan('LYB', {
          totalEvaluated: 9,
          eligible: 2,
          queued: 1,
          claimed: 1,
          deferred: 4,
          rejected: 1,
        }),
      ],
      true,
      NOW
    );

    assert.equal(receipt.coverage.complete, true);
    assert.deepEqual(receipt.counts, {
      totalEvaluated: 1010,
      eligible: 42,
      queued: 21,
      claimed: 11,
      deferred: 904,
      rejected: 32,
      unclassified: 0,
    });
    assert.deepEqual(receipt.invariant, {
      classifiedSum: 1010,
      matchesTotal: true,
      unclassifiedZero: true,
    });
    assert.equal(receipt.retry.automatic, false);
  });

  it('never turns a transport-partial team into a false zero', () => {
    const incomplete = {
      team: 'JOV',
      status: 'blocked',
      stage: 'coverage',
      admissionScan: {
        coverage: { complete: false, scanned: 150, reason: 'rate-limited' },
        counts: null,
      },
      mutations: 0,
    };
    const receipt = admissionRunReceipt([incomplete], false, NOW);
    assert.equal(receipt.coverage.complete, false);
    assert.equal(receipt.invariant.matchesTotal, false);
    assert.equal(receipt.invariant.unclassifiedZero, false);
    assert.deepEqual(receipt.retry, {
      automatic: true,
      mode: 'restart-exhaustive-from-null',
      trigger: 'next-scheduled-gate-run',
    });
  });

  it('resumes candidate-level poison isolation on the next scheduled run', () => {
    const result = teamScan('JOV', {
      totalEvaluated: 2,
      eligible: 1,
      queued: 0,
      claimed: 0,
      deferred: 1,
      rejected: 0,
    });
    result.stage = 'candidate-budget';
    const receipt = admissionRunReceipt([result], false, NOW);
    assert.equal(receipt.coverage.complete, true);
    assert.deepEqual(receipt.retry, {
      automatic: true,
      mode: 'resume-after-candidate-backoff',
      trigger: 'next-scheduled-gate-run',
    });
  });
});
