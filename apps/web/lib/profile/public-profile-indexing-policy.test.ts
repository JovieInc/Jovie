import { describe, expect, it } from 'vitest';
import { isReservedPublicProfileIdentity } from './public-profile-identity-policy';
import {
  getPublicProfileIndexingExclusionReason,
  getPublicProfileRobots,
  isPublicProfileIndexable,
  PUBLIC_PROFILE_PRODUCTION_CANARY_HANDLE,
} from './public-profile-indexing-policy';

describe('public profile indexing policy', () => {
  it.each([
    ['dualipa', 'fabricated_identity_fixture'],
    ['taylorswift', 'fabricated_identity_fixture'],
    ['testartist', 'legacy_claim_fixture'],
    ['authqaprod', 'production_canary'],
    ['e2e-test-user', 'qa_auth_fixture'],
    ['e2eclaimartist', 'claim_flow_fixture'],
  ] as const)('excludes verified synthetic handle %s', (handle, reason) => {
    expect(getPublicProfileIndexingExclusionReason(handle)).toBe(reason);
    expect(isPublicProfileIndexable(handle)).toBe(false);
  });

  it('normalizes exact synthetic handles before matching', () => {
    expect(getPublicProfileIndexingExclusionReason('  AuthQaProd ')).toBe(
      'production_canary'
    );
  });

  it.each([
    'tim',
    'realtestartist',
    'dualipa-official',
    'authqaprod-music',
    'native-auth-smoke-jov-ie-band',
  ])('does not hide a similarly named real creator: %s', handle => {
    expect(getPublicProfileIndexingExclusionReason(handle)).toBeNull();
    expect(isPublicProfileIndexable(handle)).toBe(true);
  });

  it('defines the production canary as a non-indexed identity', () => {
    expect(PUBLIC_PROFILE_PRODUCTION_CANARY_HANDLE).toBe('authqaprod');
    expect(
      isPublicProfileIndexable(PUBLIC_PROFILE_PRODUCTION_CANARY_HANDLE)
    ).toBe(false);
    expect(
      getPublicProfileRobots(PUBLIC_PROFILE_PRODUCTION_CANARY_HANDLE)
    ).toMatchObject({
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    });
  });

  it('keeps the dedicated claim fixture claimable but non-indexable', () => {
    expect(isPublicProfileIndexable('e2eclaimartist')).toBe(false);
    expect(isReservedPublicProfileIdentity('e2eclaimartist')).toBe(true);
  });

  it('provides indexable metadata for legitimate profiles', () => {
    expect(getPublicProfileRobots('tim')).toMatchObject({
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    });
  });

  // -------------------------------------------------------------------------
  // JOV-6126: QA machine-handle shapes must stay non-indexable even when the
  // profile row has been claimed by an automated Clerk test user. Shape-matched
  // (not exact-listed) so newly provisioned QA identities fail closed.
  // -------------------------------------------------------------------------

  it.each([
    'tmoc0g1x9dwmk71',
    'tmoc209131l1r6w',
    'tmoc46fryq6bfjq',
    'tmoc5lql8bre49o',
    'tmoc9mm7xfvx02c',
  ])('excludes a claimed Clerk-test machine handle: %s', handle => {
    expect(getPublicProfileIndexingExclusionReason(handle)).toBe(
      'qa_machine_handle'
    );
    expect(isPublicProfileIndexable(handle)).toBe(false);
  });

  it('excludes machine handles by shape regardless of claimed state', () => {
    // The exact-handle reservation registry does not list these; only the
    // shape rule covers them. Claimed state is not an input to this check.
    expect(isReservedPublicProfileIdentity('tmoc0g1x9dwmk71')).toBe(false);
    expect(isPublicProfileIndexable('tmoc0g1x9dwmk71')).toBe(false);
  });

  it('excludes profile shape variants matching the QA machine-handle pattern', () => {
    // Future QA runs may mint different suffixes; the shape must keep holding.
    expect(isPublicProfileIndexable('tmoczzzzzzzzzzzz1')).toBe(false);
    expect(isPublicProfileIndexable('Tmoc0G1X9DWMK71')).toBe(false);
  });

  it.each([
    ['tmoc0g1x9dwmk71', 'gp moc+clerk test'],
    ['tmoc209131l1r6w', 'GP MOC+CLERK TEST'],
  ])('excludes by Clerk-test display name even without the handle shape: %s', (handle, displayName) => {
    expect(isPublicProfileIndexable(handle, displayName)).toBe(false);
    expect(getPublicProfileRobots(handle, displayName)).toMatchObject({
      index: false,
      follow: false,
    });
  });

  it('keeps legitimate creators indexable alongside the display-name check', () => {
    expect(isPublicProfileIndexable('tim', 'Tim White')).toBe(true);
    expect(isPublicProfileIndexable('realartist', '')).toBe(true);
    expect(isPublicProfileIndexable('realartist', null)).toBe(true);
    expect(isPublicProfileIndexable('realartist', undefined)).toBe(true);
  });

  it('does not hide similarly named real creators that fail the machine-handle shape', () => {
    // Too short, wrong prefix, or non-base36 tails must never be excluded.
    expect(isPublicProfileIndexable('tmoc123456789')).toBe(true);
    expect(isPublicProfileIndexable('tmoc')).toBe(true);
    expect(isPublicProfileIndexable('tmoc-artist')).toBe(true);
    expect(isPublicProfileIndexable('tmoc123456789abc!', 'Tim White')).toBe(
      true
    );
    expect(isPublicProfileIndexable('tim', 'gp mock +clerk testing')).toBe(
      true
    );
  });
});
