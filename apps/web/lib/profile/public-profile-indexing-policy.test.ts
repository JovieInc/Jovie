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
    expect(isReservedPublicProfileIdentity('e2eclaimartist')).toBe(false);
  });

  it('provides indexable metadata for legitimate profiles', () => {
    expect(getPublicProfileRobots('tim')).toMatchObject({
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    });
  });
});
