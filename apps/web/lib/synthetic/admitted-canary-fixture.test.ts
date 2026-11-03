import { describe, expect, it } from 'vitest';
import { isInternalOrTestAccountEmail } from '@/lib/utils/email';
import {
  ADMITTED_CANARY_FIXTURE,
  AdmittedCanaryGuardError,
  type AdmittedCanaryObservedState,
  assertAdmittedCanaryOwnershipEligible,
  isAdmittedCanaryConverged,
  isAdmittedCanaryEmail,
  isPublicViewAllowlistedCanaryHandle,
  PUBLIC_VIEW_ALLOWLISTED_CANARY_HANDLES,
  planAdmittedCanary,
} from './admitted-canary-fixture';
import { isProdcertCanaryEmail } from './prodcert-identities';

const EMAIL = ADMITTED_CANARY_FIXTURE.email;

const NEAR_MISSES = [
  'browse-ready+canary-admitted2@jov.ie',
  'browse-ready+canary-admitted@jov.ie.evil.com',
  'browse-ready+canary-admitted@example.com',
  'browse-ready+canary@jov.ie',
  'browse-ready@jov.ie',
  'browse-ready+clerk_test@jov.ie',
  'browse-ready+synthetic-prodcert-abc123@jov.ie',
  'canary-admitted@jov.ie',
  'tim@jov.ie',
  '',
];

describe('isAdmittedCanaryEmail', () => {
  it('matches the exact fixture address, normalized', () => {
    expect(isAdmittedCanaryEmail(EMAIL)).toBe(true);
    expect(isAdmittedCanaryEmail(`  ${EMAIL.toUpperCase()} `)).toBe(true);
  });

  it.each(NEAR_MISSES)('never matches %s', email => {
    expect(isAdmittedCanaryEmail(email)).toBe(false);
  });

  it('rejects null and undefined', () => {
    expect(isAdmittedCanaryEmail(null)).toBe(false);
    expect(isAdmittedCanaryEmail(undefined)).toBe(false);
  });

  it('is excluded from customer metrics', () => {
    expect(isInternalOrTestAccountEmail(EMAIL)).toBe(true);
  });

  it('is a production cert canary for the OTP reader, exact only', () => {
    expect(isProdcertCanaryEmail(EMAIL)).toBe(true);
    expect(isProdcertCanaryEmail('browse-ready+canary-admitted2@jov.ie')).toBe(
      false
    );
  });
});

describe('public-view allowlist', () => {
  it('contains exactly the fixture handle', () => {
    expect(PUBLIC_VIEW_ALLOWLISTED_CANARY_HANDLES).toEqual([
      ADMITTED_CANARY_FIXTURE.handle,
    ]);
    expect(isPublicViewAllowlistedCanaryHandle(' Unmarked-Pavement ')).toBe(
      true
    );
    expect(isPublicViewAllowlistedCanaryHandle('unmarkedpavement')).toBe(false);
    expect(isPublicViewAllowlistedCanaryHandle(null)).toBe(false);
  });
});

describe('assertAdmittedCanaryOwnershipEligible', () => {
  const ok = {
    handle: ADMITTED_CANARY_FIXTURE.handle,
    spotifyId: ADMITTED_CANARY_FIXTURE.artist.spotifyId,
    ownerEmail: EMAIL,
    settings: {},
  };

  it('accepts the exact fixture owner, handle and artist', () => {
    expect(() => assertAdmittedCanaryOwnershipEligible(ok)).not.toThrow();
  });

  it('refuses a missing owner', () => {
    expect(() => assertAdmittedCanaryOwnershipEligible(null)).toThrow(
      AdmittedCanaryGuardError
    );
  });

  it.each(NEAR_MISSES)('refuses owner %s', ownerEmail => {
    expect(() =>
      assertAdmittedCanaryOwnershipEligible({ ...ok, ownerEmail })
    ).toThrow(/not the admitted canary/);
  });

  it('refuses another handle or artist', () => {
    expect(() =>
      assertAdmittedCanaryOwnershipEligible({ ...ok, handle: 'someone' })
    ).toThrow(/handle/);
    expect(() =>
      assertAdmittedCanaryOwnershipEligible({ ...ok, spotifyId: null })
    ).toThrow(/artist/);
  });

  it('refuses a fixture override that swaps the address', () => {
    expect(() =>
      assertAdmittedCanaryOwnershipEligible(
        { ...ok, ownerEmail: 'real.artist@gmail.com' },
        { ...ADMITTED_CANARY_FIXTURE, email: 'real.artist@gmail.com' }
      )
    ).toThrow(/not the admitted canary/);
  });
});

const EMPTY: AdmittedCanaryObservedState = {
  user: null,
  waitlistEntry: null,
  profile: null,
  ownerClaimRow: false,
  handleHeldByOther: false,
  artistHeldByOther: false,
};

const CONVERGED: AdmittedCanaryObservedState = {
  user: { id: 'u1', waitlistEntryId: 'w1', userStatus: 'waitlist_approved' },
  waitlistEntry: { id: 'w1', status: 'approved' },
  profile: {
    id: 'p1',
    handle: ADMITTED_CANARY_FIXTURE.handle,
    spotifyId: ADMITTED_CANARY_FIXTURE.artist.spotifyId,
    userId: 'u1',
    waitlistEntryId: 'w1',
    isClaimed: true,
    isPublic: true,
    claimVerificationStatus: 'verified',
    proofOnly: true,
  },
  ownerClaimRow: true,
  handleHeldByOther: false,
  artistHeldByOther: false,
};

describe('planAdmittedCanary', () => {
  it('plans every step for an empty database', () => {
    const steps = planAdmittedCanary(EMPTY);
    expect(steps.map(s => [s.id, s.action])).toEqual([
      ['user', 'create'],
      ['waitlist_entry', 'create'],
      ['profile', 'create'],
      ['waitlist_approval', 'apply'],
      ['owner_claim', 'create'],
      ['ownership_proof', 'apply'],
    ]);
    expect(isAdmittedCanaryConverged(steps)).toBe(false);
  });

  it('is a no-op once converged (idempotent)', () => {
    const steps = planAdmittedCanary(CONVERGED);
    expect(steps.every(s => s.action === 'ok')).toBe(true);
    expect(isAdmittedCanaryConverged(steps)).toBe(true);
  });

  it('never takes a handle or artist another profile holds', () => {
    for (const held of [
      { handleHeldByOther: true },
      { artistHeldByOther: true },
    ]) {
      const steps = planAdmittedCanary({ ...EMPTY, ...held });
      expect(steps.at(-1)).toMatchObject({ id: 'profile', action: 'blocked' });
    }
  });

  it('blocks on a drifted profile instead of rewriting it', () => {
    const steps = planAdmittedCanary({
      ...CONVERGED,
      profile: { ...CONVERGED.profile!, spotifyId: 'other' },
    });
    expect(steps.at(-1)).toMatchObject({ id: 'profile', action: 'blocked' });
  });

  it('blocks a terminal waitlist status', () => {
    const steps = planAdmittedCanary({
      ...CONVERGED,
      waitlistEntry: { id: 'w1', status: 'rejected' },
      profile: { ...CONVERGED.profile!, isClaimed: false },
    });
    expect(steps.at(-1)).toMatchObject({
      id: 'waitlist_approval',
      action: 'blocked',
    });
  });

  it('re-proves a verified profile that lost publication', () => {
    const steps = planAdmittedCanary({
      ...CONVERGED,
      profile: { ...CONVERGED.profile!, isPublic: false },
    });
    expect(steps.at(-1)).toMatchObject({
      id: 'ownership_proof',
      action: 'apply',
    });
  });
});
