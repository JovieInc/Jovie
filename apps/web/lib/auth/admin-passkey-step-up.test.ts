import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));

import { passkeyChangeAllowed } from './admin-passkey-step-up';

const MIN = 60 * 1000;

describe('passkeyChangeAllowed', () => {
  it('allows first enrollment right after sign-in', () => {
    expect(
      passkeyChangeAllowed({
        hasLiveStepUp: false,
        existingPasskeys: 0,
        sessionAgeMs: 2 * MIN,
      })
    ).toBe(true);
  });

  it('refuses first enrollment on an old (possibly stolen) session', () => {
    expect(
      passkeyChangeAllowed({
        hasLiveStepUp: false,
        existingPasskeys: 0,
        sessionAgeMs: 11 * MIN,
      })
    ).toBe(false);
  });

  it('refuses adding or removing passkeys without a step-up once one exists', () => {
    expect(
      passkeyChangeAllowed({
        hasLiveStepUp: false,
        existingPasskeys: 1,
        sessionAgeMs: MIN,
      })
    ).toBe(false);
  });

  it('allows changes with a live step-up', () => {
    expect(
      passkeyChangeAllowed({
        hasLiveStepUp: true,
        existingPasskeys: 3,
        sessionAgeMs: 100 * MIN,
      })
    ).toBe(true);
  });

  it('refuses clock-skewed future sessions', () => {
    expect(
      passkeyChangeAllowed({
        hasLiveStepUp: false,
        existingPasskeys: 0,
        sessionAgeMs: -5 * MIN,
      })
    ).toBe(false);
  });
});
