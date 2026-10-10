import { describe, expect, it } from 'vitest';
import {
  isEntitlementDenialError,
  isEntitlementDenialMessage,
} from './plan-gate-errors';

describe('plan gate errors', () => {
  it.each([
    'Tasks requires an Artist Presence plan.',
    'Release plans require an Artist Presence plan.',
    'Tasks requires a Pro plan.',
    'Release plans require the Pro plan.',
  ])('recognizes a serialized entitlement denial: %s', message => {
    expect(isEntitlementDenialMessage(message)).toBe(true);
    expect(isEntitlementDenialError(new Error(message))).toBe(true);
  });

  it('prefers stable error names and codes when they survive serialization', () => {
    const named = new Error('redacted');
    named.name = 'TasksUpgradeRequiredError';

    expect(isEntitlementDenialError(named)).toBe(true);
    expect(isEntitlementDenialError({ code: 'RELEASE_PLAN_LOCKED' })).toBe(
      true
    );
  });

  it('does not classify unrelated failures as plan gates', () => {
    expect(isEntitlementDenialError(new Error('database unavailable'))).toBe(
      false
    );
  });
});
