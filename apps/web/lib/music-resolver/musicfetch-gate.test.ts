import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  isMusicfetchSubscriptionInactive,
  isMusicResolverFamilyEnabled,
  MUSICFETCH_REMEDIATION_ISSUE,
  musicfetchNetworkAllowed,
  musicfetchRemediation,
  musicResolverCutoverReceipt,
  noteMusicfetchHttpStatus,
  noteMusicfetchMissingToken,
  resetMusicfetchDormantForTests,
} from './musicfetch-gate';

describe('MusicFetch dormant gate', () => {
  afterEach(() => {
    resetMusicfetchDormantForTests();
    delete process.env.FEATURE_IN_HOUSE_RESOLVER;
    delete process.env.FEATURE_MUSICFETCH_FALLBACK;
    delete process.env.FEATURE_MUSIC_RESOLVER_PROVIDER_LINKS;
    delete process.env.FEATURE_MUSIC_RESOLVER_RELEASE_FACTS;
  });

  it('points every musicfetch fingerprint at JOV-7323 and not a renewal', () => {
    for (const reason of [
      'missing_token',
      'subscription_inactive',
      'unauthorized',
    ] as const) {
      const remediation = musicfetchRemediation(reason);
      expect(
        remediation.fingerprint.startsWith('remediation:musicfetch-')
      ).toBe(true);
      expect(remediation.issue).toBe(MUSICFETCH_REMEDIATION_ISSUE);
      expect(remediation.issue).toBe('JOV-7323');
      expect(remediation.renewal).toBe(false);
    }
    expect(noteMusicfetchMissingToken().fingerprint).toBe(
      'remediation:musicfetch-missing-token'
    );
    expect(musicfetchNetworkAllowed()).toBe(true);
  });

  it('latches a 401 subscription failure so later calls do not hit the network', () => {
    expect(isMusicfetchSubscriptionInactive('subscription not active')).toBe(
      true
    );
    const noted = noteMusicfetchHttpStatus(401, 'subscription not active');
    expect(noted?.fingerprint).toBe(
      'remediation:musicfetch-subscription-inactive'
    );
    expect(musicfetchNetworkAllowed()).toBe(false);
    expect(noteMusicfetchHttpStatus(500, 'unavailable')).toBeNull();
  });

  it('does not let the legacy umbrella flag trigger final vendor-off', () => {
    process.env.FEATURE_IN_HOUSE_RESOLVER = 'true';
    expect(isMusicResolverFamilyEnabled('provider_links')).toBe(true);
    expect(isMusicResolverFamilyEnabled('release_facts')).toBe(true);
    expect(musicfetchNetworkAllowed()).toBe(true);
  });

  it('stages families independently and exposes an exact rollback receipt', () => {
    process.env.FEATURE_MUSIC_RESOLVER_PROVIDER_LINKS = 'true';
    process.env.FEATURE_MUSICFETCH_FALLBACK = 'false';

    expect(isMusicResolverFamilyEnabled('provider_links')).toBe(true);
    expect(isMusicResolverFamilyEnabled('release_facts')).toBe(false);
    expect(musicfetchNetworkAllowed()).toBe(true);

    process.env.FEATURE_MUSIC_RESOLVER_RELEASE_FACTS = 'true';
    expect(musicfetchNetworkAllowed()).toBe(false);
    expect(musicResolverCutoverReceipt()).toMatchObject({
      schema: 'jovie.music-resolver-cutover/v1',
      families: {
        provider_links: true,
        release_facts: true,
        smart_link_creation: true,
      },
      musicfetch: {
        fallbackEnabled: false,
        networkAllowed: false,
        vendorOffRequested: true,
      },
      rollback: { enableVendorFallback: 'FEATURE_MUSICFETCH_FALLBACK=true' },
    });
  });
});
