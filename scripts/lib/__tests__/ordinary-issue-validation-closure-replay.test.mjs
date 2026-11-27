/**
 * Ordinary-issue validation-closure fixture replay (plan §4.1 item 3,
 * INV-TERMINAL-RECEIPT-1). Hermetic only — fake clock/state, no network or
 * secrets. Cross-ref Summer vector/PR:
 * https://github.com/JovieInc/summer-config/pull/531
 *
 * Asserts validation-lifecycle.mjs + JS outcome residual policy refuse Done
 * while any mandatory acceptance item is unverifiable (regression against
 * verified-with-residual premature pass), then project one workKey-bound
 * terminal state suitable for Ovie shipping-state once verified.
 */

import { describe, expect, it } from 'vitest';
import {
  decideOutcomeResidual,
  mayEmitOutcomePassReceipt,
} from '../outcome-residual-policy.mjs';
import {
  createOrdinaryIssueValidationClosureHarness,
  deriveOrdinaryWorkKey,
  ORDINARY_ISSUE_CLOSURE_VECTOR,
} from './fixtures/ordinary-issue-validation-closure.mjs';

const vector = ORDINARY_ISSUE_CLOSURE_VECTOR;
const id = vector.identifiers;
const W1 = id.expectedWorkKey;

const PASS_HTTP = {
  criterion: 'GET /r/y returns 404 (not 500) on production',
  status: 'pass',
  evidence: "GET https://jov.ie/r/y -> 404 We can't find that page",
  mandatory: true,
};
const PASS_REDIRECT = {
  criterion: 'Valid legacy /r/<slug>--<uuid> still 308 redirects',
  status: 'pass',
  evidence: 'GET /r/fixture--00000000-0000-4000-8000-000000000001 -> 308',
  mandatory: true,
};
const UNVERIFIABLE_SENTRY = {
  criterion:
    'Sentry issue 9900001 has zero events in the 24h post-deploy window',
  status: 'unverifiable',
  evidence:
    'Sentry API HTTP 401; SENTRY_AUTH_TOKEN absent on lane host; window unelapsed',
  mandatory: true,
};

describe('ordinary-issue validation-closure replay (INV-TERMINAL-RECEIPT-1)', () => {
  it('derives the Summer-aligned workKey for the fixture episode', () => {
    expect(deriveOrdinaryWorkKey(vector)).toBe(W1);
    expect(deriveOrdinaryWorkKey(vector, vector.policy.signalFingerprint)).toBe(
      W1
    );
  });

  it('refuses verified-with-residual: mandatory unverifiable holds, never aggregate pass', () => {
    // Legacy outcome_lane.py would emit status=pass / reason=verified-with-residual
    // when len(passed) > len(residual). INV-TERMINAL-RECEIPT-1 forbids that.
    const legacyWouldPass = decideOutcomeResidual([
      PASS_HTTP,
      PASS_REDIRECT,
      UNVERIFIABLE_SENTRY,
    ]);
    expect(legacyWouldPass.status).toBe('hold');
    expect(legacyWouldPass.reason).toBe('mandatory-unverifiable');
    expect(legacyWouldPass.residual).toHaveLength(1);
    expect(legacyWouldPass.residual[0].criterion).toContain('Sentry');
    expect(mayEmitOutcomePassReceipt(legacyWouldPass)).toBe(false);
    expect(legacyWouldPass.completionHolds[0]).toMatch(
      /outcome residual unverifiable \(mandatory\)/
    );
  });

  it('Stage 5a: validation-lifecycle stays Validating while mandatory residual is unverifiable', () => {
    const h = createOrdinaryIssueValidationClosureHarness(vector);
    h.seedIssue();

    const { residualDecision, transition, afterUnverifiable } =
      h.productionAndVerifyWithResidual([
        PASS_HTTP,
        PASS_REDIRECT,
        UNVERIFIABLE_SENTRY,
      ]);

    expect(residualDecision.status).toBe('hold');
    expect(afterUnverifiable).toBe('Validating');
    expect(transition.target).toBe('Validating');
    expect(transition.explanation).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/unverifiable \(mandatory\)/),
      ])
    );
    // Must not reach Done on residual majority-pass.
    expect(transition.target).not.toBe('Done');
    expect(h.linear.getIssue(id.issue)?.state).toBe('Validating');
    expect(h.ovie.getShippingItemByWorkKey(W1)).toBeNull();
  });

  it('Stage 5b→6: empty residual + verified receipts → one Done + workKey Ovie projection', () => {
    const h = createOrdinaryIssueValidationClosureHarness(vector);
    h.seedIssue();

    const cleared = h.productionAndVerifyWithResidual([
      PASS_HTTP,
      PASS_REDIRECT,
      {
        ...UNVERIFIABLE_SENTRY,
        status: 'pass',
        evidence:
          'Sentry issue 9900001: 0 events in authenticated 24h window after deploy',
      },
    ]);

    expect(cleared.residualDecision.status).toBe('pass');
    expect(cleared.residualDecision.reason).toBe('all-items-verified');
    expect(cleared.residualDecision.residual).toEqual([]);
    expect(mayEmitOutcomePassReceipt(cleared.residualDecision)).toBe(true);
    expect(cleared.transition.target).toBe('Done');

    const first = h.sealTerminalFromTransition(cleared.transition);
    const second = h.sealTerminalFromTransition(cleared.transition);

    expect(h.linear.getIssue(id.issue)?.state).toBe('Done');
    expect(
      h.linear.stateTransitions(id.issue).filter(t => t.to === 'Done')
    ).toHaveLength(1);
    expect(
      h.linear
        .commentsWithMarker(id.issue, vector.markers.validationLifecycle)
        .filter(c => c.movesToDone)
    ).toHaveLength(1);
    expect(first.statusKey).toBe(second.statusKey);
    expect(h.ovie.getShippingItemByWorkKey(W1)).toMatchObject({
      issue: id.issue,
      stage: 'verified',
      workKey: W1,
      prNumber: id.prNumber,
      mergeSha: id.M1,
      prodSha: id.P1,
    });
  });

  it('keeps taste needs-authority as non-blocking residual once mandatory items pass', () => {
    const decision = decideOutcomeResidual([
      PASS_HTTP,
      PASS_REDIRECT,
      {
        criterion: 'Founder accepts the casing taste on the 404 page',
        status: 'needs-authority',
        evidence: 'Tim decides visual taste on production',
        mandatory: true,
      },
    ]);
    // Taste is owned by founder-taste receipt — residual policy does not hold Done.
    expect(decision.status).toBe('pass');
    expect(decision.reason).toBe('all-items-verified');
    expect(decision.residual).toHaveLength(1);
    expect(mayEmitOutcomePassReceipt(decision)).toBe(true);
  });

  it('fails closed on empty, malformed, failed, or non-taste needs-authority items', () => {
    expect(decideOutcomeResidual([]).reason).toBe('no-acceptance-items');
    expect(decideOutcomeResidual(/** @type {any} */ (null)).reason).toBe(
      'no-acceptance-items'
    );
    expect(decideOutcomeResidual([/** @type {any} */ ('x')]).reason).toBe(
      'verdict-item-malformed'
    );
    expect(
      decideOutcomeResidual([
        {
          criterion: '',
          status: 'pass',
          evidence: 'apps/web/x.ts:1 shows fix',
        },
      ]).reason
    ).toBe('verdict-item-malformed');
    expect(
      decideOutcomeResidual([
        {
          criterion: 'Chat streams',
          status: 'maybe',
          evidence: 'apps/web/x.ts:1 shows fix',
        },
      ]).reason
    ).toBe('verdict-item-malformed');

    const failed = decideOutcomeResidual([
      PASS_HTTP,
      {
        criterion: 'Chat streams a reply',
        status: 'fail',
        evidence: 'Authenticated observation: stream closes with HTTP 500',
        mandatory: true,
      },
    ]);
    expect(failed.status).toBe('fail');
    expect(failed.reason).toBe('items-not-verified');
    expect(mayEmitOutcomePassReceipt(failed)).toBe(false);

    const outbound = decideOutcomeResidual([
      PASS_HTTP,
      {
        criterion: 'Send the announcement email',
        status: 'needs-authority',
        evidence: 'outbound human action required',
        mandatory: true,
      },
    ]);
    expect(outbound.status).toBe('fail');
    expect(outbound.reason).toBe('items-not-verified');
  });
});
