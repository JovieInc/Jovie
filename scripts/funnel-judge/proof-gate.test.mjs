import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  evaluateProofGate,
  PROOF_REPORT_PATH,
  readProofReport,
} from './proof-gate.mjs';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);

function report(overrides = {}) {
  return {
    schema: 'jovie.golden-path-proof/v1',
    asOf: '2026-10-04T00:00:00.000Z',
    funnelStepIds: { claim: ['claim-landing'], upgrade: ['upgrade'] },
    claims: [
      {
        id: 'claim.ok',
        step: 'claim',
        copy: 'Your profile is ready.',
        status: 'admissible',
        detail: 'certified',
      },
    ],
    prooflessPaywallSteps: [],
    proofRequests: [],
    ...overrides,
  };
}

const now = new Date('2026-10-05T00:00:00.000Z');

describe('funnel proof gate', () => {
  it('passes when every judged claim has admissible evidence', () => {
    const result = evaluateProofGate(report(), {
      judgedStepIds: ['claim-landing'],
      now,
    });
    assert.equal(result.pass, true);
  });

  it('fails a judged step that renders an unproven claim, with its request', () => {
    const request = {
      claimId: 'golden-path.claim.fake',
      generator: 'dogfood',
    };
    const result = evaluateProofGate(
      report({
        claims: [
          {
            id: 'claim.fake',
            step: 'claim',
            copy: 'Artists get 3x fans',
            status: 'invented-number',
            detail: 'no evidence',
          },
        ],
        proofRequests: [request],
      }),
      { judgedStepIds: ['claim-landing'], now }
    );
    assert.equal(result.pass, false);
    assert.match(result.failures[0], /invented-number/);
    assert.deepEqual(result.requests, [request]);
  });

  it('ignores steps the run could not judge', () => {
    const result = evaluateProofGate(
      report({ prooflessPaywallSteps: ['upgrade'] }),
      { judgedStepIds: ['claim-landing'], now }
    );
    assert.equal(result.pass, true);
  });

  it('fails a judged paywall step with no outcome proof', () => {
    const result = evaluateProofGate(
      report({ prooflessPaywallSteps: ['upgrade'] }),
      { judgedStepIds: ['upgrade'], now }
    );
    assert.equal(result.pass, false);
    assert.match(result.failures[0], /\$199/);
  });

  it('fails stale or missing reports', () => {
    assert.equal(
      evaluateProofGate(report(), {
        judgedStepIds: [],
        now: new Date('2026-12-01T00:00:00.000Z'),
      }).pass,
      false
    );
    assert.equal(
      evaluateProofGate(null, { judgedStepIds: [], now }).pass,
      false
    );
    for (const asOf of ['2027-01-01T00:00:00.000Z', 'not-a-date', undefined]) {
      const result = evaluateProofGate(report({ asOf }), {
        judgedStepIds: [],
        now,
      });
      assert.equal(result.pass, false, String(asOf));
      assert.match(result.failures[0], /invalid or in the future/);
    }
  });

  it('reads the committed golden-path report', () => {
    const committed = readProofReport(join(ROOT, PROOF_REPORT_PATH));
    assert.equal(committed.schema, 'jovie.golden-path-proof/v1');
    assert.ok(Array.isArray(committed.claims) && committed.claims.length > 0);
  });
});
