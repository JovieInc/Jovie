import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  isMusicfetchSubscriptionInactive,
  MUSICFETCH_REMEDIATION_ISSUE,
  musicfetchNetworkAllowed,
  musicfetchRemediation,
  noteMusicfetchHttpStatus,
  noteMusicfetchMissingToken,
  resetMusicfetchDormantForTests,
} from './musicfetch-gate';

describe('MusicFetch dormant gate', () => {
  afterEach(() => {
    resetMusicfetchDormantForTests();
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
});
