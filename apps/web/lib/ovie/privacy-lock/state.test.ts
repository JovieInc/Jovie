import { describe, expect, it } from 'vitest';
import {
  isFreshPrivacyCeremony,
  OVIE_PRIVACY_UNLOCK_TTL_MS,
  resolveOviePrivacyState,
} from './state';

const now = Date.parse('2026-09-29T20:00:00Z');
const policy = { enabled: true, version: 2, lockedAt: new Date(now - 1000) };
const receipt = (
  value: unknown = {},
  expiresAt = now + OVIE_PRIVACY_UNLOCK_TTL_MS
) => ({
  value: JSON.stringify({
    userId: 'u1',
    version: 2,
    unlockedAt: now,
    ...(value as object),
  }),
  expiresAt: new Date(expiresAt),
});
describe('Ovie privacy state', () => {
  it('defaults disabled and unblocked without any receipt', () => {
    expect(
      resolveOviePrivacyState(
        { ...policy, enabled: false },
        undefined,
        'u1',
        now
      )
    ).toEqual({ enabled: false, locked: false, unlockedUntil: null });
  });
  it('keeps opted-in missing receipt locked', () => {
    expect(resolveOviePrivacyState(policy, undefined, 'u1', now).locked).toBe(
      true
    );
  });
  it('retains a 24-hour privacy unlock beyond admin MFA lifetime', () => {
    expect(
      resolveOviePrivacyState(policy, receipt(), 'u1', now + 13 * 3600000)
        .locked
    ).toBe(false);
  });
  it('locks exactly at the 24-hour boundary', () => {
    expect(
      resolveOviePrivacyState(
        policy,
        receipt(),
        'u1',
        now + OVIE_PRIVACY_UNLOCK_TTL_MS
      ).locked
    ).toBe(true);
  });
  it.each([
    { userId: 'u2' },
    { version: 1 },
    { unlockedAt: now + 1 },
    { unlockedAt: 'yesterday' },
    { unlockedAt: null },
  ])('rejects invalid receipt %j', value => {
    expect(
      resolveOviePrivacyState(policy, receipt(value), 'u1', now).locked
    ).toBe(true);
  });
  it('rejects invalid JSON', () => {
    expect(
      resolveOviePrivacyState(
        policy,
        { value: 'broken', expiresAt: new Date(now + 10) },
        'u1',
        now
      ).locked
    ).toBe(true);
  });
  it('rejects expiry beyond 24h', () => {
    expect(
      resolveOviePrivacyState(
        policy,
        receipt({}, now + OVIE_PRIVACY_UNLOCK_TTL_MS + 1),
        'u1',
        now
      ).locked
    ).toBe(true);
  });
  it('rejects invalid expiry', () => {
    expect(
      resolveOviePrivacyState(policy, receipt({}, NaN), 'u1', now).locked
    ).toBe(true);
  });
  it('invalidates previously minted receipts on explicit relock', () => {
    expect(
      resolveOviePrivacyState(
        { ...policy, version: 3, lockedAt: new Date(now) },
        receipt(),
        'u1',
        now
      ).locked
    ).toBe(true);
  });
  it('invalidates in-flight pre-lock receipt even with matching version', () => {
    expect(
      resolveOviePrivacyState(
        { ...policy, lockedAt: new Date(now) },
        receipt(),
        'u1',
        now
      ).locked
    ).toBe(true);
  });
  it('accepts only a recent same-session admin ceremony newer than lock', () => {
    expect(
      isFreshPrivacyCeremony(
        new Date(now).toISOString(),
        new Date(now + 1000),
        policy,
        now
      )
    ).toBe(true);
  });
  it.each([now - 300001, now + 1, now - 1000])(
    'rejects stale/future/prelock ceremony %s',
    time => {
      expect(
        isFreshPrivacyCeremony(
          new Date(time).toISOString(),
          new Date(now + 1000),
          policy,
          now
        )
      ).toBe(false);
    }
  );
  it('rejects expired/malformed admin proof', () => {
    expect(isFreshPrivacyCeremony('bad', new Date(now + 1), policy, now)).toBe(
      false
    );
    expect(
      isFreshPrivacyCeremony(
        new Date(now).toISOString(),
        new Date(now),
        policy,
        now
      )
    ).toBe(false);
  });
});
