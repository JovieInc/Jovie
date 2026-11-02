import { describe, expect, it } from 'vitest';
import { createAppShellDegradedTolerance } from '../../product-screenshots/_lib/app-shell-degraded-tolerance';

// Mirrors the proofRoute each app-shell screen-cert producer passes
// (tasks-screen-proof.spec.ts / contacts-screen-proof.spec.ts).
const PROOF_ROUTE = '/app/tasks';
const ORIGIN = 'http://localhost:3100';

describe('app-shell degraded tolerance', () => {
  const tolerance = createAppShellDegradedTolerance(PROOF_ROUTE);

  describe('isExpectedDegradedRequestFailure', () => {
    it('admits the aborted sidebar What\u2019s New feed fetch (JOV-8486)', () => {
      expect(
        tolerance.isExpectedDegradedRequestFailure(
          `${ORIGIN}/changelog/whats-new.json net::ERR_ABORTED`
        )
      ).toBe(true);
    });

    it('admits an aborted proof-route re-request', () => {
      expect(
        tolerance.isExpectedDegradedRequestFailure(
          `${ORIGIN}${PROOF_ROUTE} net::ERR_ABORTED`
        )
      ).toBe(true);
    });

    it('admits aborted chrome API degradation paths', () => {
      expect(
        tolerance.isExpectedDegradedRequestFailure(
          `${ORIGIN}/api/analytics/navigation net::ERR_ABORTED`
        )
      ).toBe(true);
      expect(
        tolerance.isExpectedDegradedRequestFailure(
          `${ORIGIN}/api/chat/conversations net::ERR_ABORTED`
        )
      ).toBe(true);
    });

    it('does not admit aborts on unrelated paths', () => {
      expect(
        tolerance.isExpectedDegradedRequestFailure(
          `${ORIGIN}/api/dashboard/tasks net::ERR_ABORTED`
        )
      ).toBe(false);
      expect(
        tolerance.isExpectedDegradedRequestFailure(
          `${ORIGIN}/changelog/whats-new.json/feed net::ERR_ABORTED`
        )
      ).toBe(false);
    });

    it('tolerates only the abort error, never real failures', () => {
      expect(
        tolerance.isExpectedDegradedRequestFailure(
          `${ORIGIN}/changelog/whats-new.json net::ERR_CONNECTION_REFUSED`
        )
      ).toBe(false);
      expect(
        tolerance.isExpectedDegradedRequestFailure(
          `${ORIGIN}/changelog/whats-new.json 500 Internal Server Error`
        )
      ).toBe(false);
    });

    it('rejects malformed entries', () => {
      expect(tolerance.isExpectedDegradedRequestFailure('not a url')).toBe(
        false
      );
      expect(tolerance.isExpectedDegradedRequestFailure('')).toBe(false);
    });
  });

  describe('isExpectedDegradedResponse', () => {
    it('still tolerates only the documented chrome-widget statuses', () => {
      expect(
        tolerance.isExpectedDegradedResponse(
          `503 ${ORIGIN}/api/analytics/navigation`
        )
      ).toBe(true);
      expect(
        tolerance.isExpectedDegradedResponse(
          `500 ${ORIGIN}/api/chat/conversations`
        )
      ).toBe(true);
      expect(
        tolerance.isExpectedDegradedResponse(`500 ${ORIGIN}${PROOF_ROUTE}`)
      ).toBe(true);
      // The What's New fetch is tolerated only as an abort: a real failed
      // response from the changelog endpoint still fails the proof.
      expect(
        tolerance.isExpectedDegradedResponse(
          `500 ${ORIGIN}/changelog/whats-new.json`
        )
      ).toBe(false);
      expect(
        tolerance.isExpectedDegradedResponse(
          `200 ${ORIGIN}/changelog/whats-new.json`
        )
      ).toBe(false);
    });

    it('does not tolerate a wrong status on a documented path', () => {
      expect(
        tolerance.isExpectedDegradedResponse(
          `500 ${ORIGIN}/api/analytics/navigation`
        )
      ).toBe(false);
      expect(
        tolerance.isExpectedDegradedResponse(`404 ${ORIGIN}${PROOF_ROUTE}`)
      ).toBe(false);
    });
  });
});
