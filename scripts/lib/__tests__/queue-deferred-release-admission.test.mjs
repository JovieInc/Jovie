import { describe, expect, it } from 'vitest';
import {
  evaluateQueueDeferredReleaseFleetGate,
  extractQueueDeferredRelease,
  QUEUE_DEFERRED_RELEASE_MARKER,
  QUEUE_DEFERRED_RELEASE_SCHEMA,
  renderQueueDeferredReleaseComment,
  validateQueueDeferredRelease,
} from '../queue-deferred-release-admission.mjs';

const NOW = Date.now();
const HEAD = 'a'.repeat(40);

function fleet(overrides = {}) {
  return {
    schema: 'jovie-fleet-gate/v1',
    observedAt: new Date(NOW - 30_000).toISOString(),
    state: 'AMBER',
    reasons: [
      { code: 'controller-failure', layer: 'controller', severity: 'warning' },
      { code: 'queue-unknown', layer: 'promotion', severity: 'warning' },
    ],
    signals: {
      main: { status: 'green', sha: HEAD },
      production: { status: 'green', deployedSha: HEAD },
      integrity: { status: 'clear' },
    },
    promotionAdmission: { allowed: false },
    ...overrides,
  };
}

describe('queue-deferred release admission', () => {
  it('allows only the controller-observation fallback with exact healthy deployment evidence', () => {
    expect(evaluateQueueDeferredReleaseFleetGate(fleet(), NOW)).toEqual({
      allowed: true,
      mode: 'deferred-release-only',
      reason: 'controller-observation-fallback',
    });
  });

  it.each([
    ['red', fleet({ state: 'RED' })],
    [
      'production mismatch',
      fleet({
        signals: {
          main: { status: 'green', sha: HEAD },
          production: { status: 'green', deployedSha: 'b'.repeat(40) },
          integrity: { status: 'clear' },
        },
      }),
    ],
    [
      'integrity incident',
      fleet({
        signals: {
          main: { status: 'green', sha: HEAD },
          production: { status: 'green', deployedSha: HEAD },
          integrity: { status: 'active' },
        },
      }),
    ],
    [
      'unrelated amber reason',
      fleet({
        reasons: [{ code: 'production-not-green', severity: 'warning' }],
      }),
    ],
  ])('fails closed for %s', (_label, receipt) => {
    expect(evaluateQueueDeferredReleaseFleetGate(receipt, NOW).allowed).toBe(
      false
    );
  });

  it('round-trips only a fresh exact-head controller receipt', () => {
    const body = renderQueueDeferredReleaseComment({
      schema: QUEUE_DEFERRED_RELEASE_SCHEMA,
      pr: 15974,
      head: HEAD,
      releasedAt: new Date(NOW).toISOString(),
      mode: 'deferred-release-only',
      reason: 'controller-observation-fallback',
    });
    expect(body).toContain(QUEUE_DEFERRED_RELEASE_MARKER);
    expect(extractQueueDeferredRelease(body, NOW)).toMatchObject({
      pr: 15974,
      head: HEAD,
      mode: 'deferred-release-only',
    });
    expect(
      validateQueueDeferredRelease(
        {
          schema: QUEUE_DEFERRED_RELEASE_SCHEMA,
          pr: 15974,
          head: HEAD,
          releasedAt: new Date(NOW - 16 * 60_000).toISOString(),
          mode: 'deferred-release-only',
          reason: 'controller-observation-fallback',
        },
        NOW
      ).ok
    ).toBe(false);
  });
});
