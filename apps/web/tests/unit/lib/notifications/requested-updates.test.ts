import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getTableName } from 'drizzle-orm';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { notificationSubscriptions } from '@/lib/db/schema/analytics';
import { fanReleaseNotifications } from '@/lib/db/schema/dsp-enrichment';
import { notificationContacts } from '@/lib/db/schema/notifications';
import { TRIAL_NOTIFICATION_RECIPIENT_LIMIT } from '@/lib/entitlements/registry';
import {
  getRequestedUpdateEligibility,
  isConditionVerified,
  type RequestedUpdate,
  type RequestedUpdateEligibilityInput,
  type WorkUpdateCondition,
} from '@/lib/notifications/requested-updates';

const WEB_ROOT = resolve(process.cwd());

const verifiedPublished: WorkUpdateCondition = {
  kind: 'work_published',
  verifiedAt: new Date('2026-10-01T00:00:00Z'),
};

function eligibleInput(
  overrides: Partial<RequestedUpdateEligibilityInput> = {}
): RequestedUpdateEligibilityInput {
  return {
    alreadyFulfilled: false,
    isClaimed: true,
    canSendNotifications: true,
    isTrialing: false,
    trialNotificationsSent: 0,
    permissionWithdrawn: false,
    hasVerifiedPermission: true,
    workAvailable: true,
    condition: verifiedPublished,
    ...overrides,
  };
}

// A genuine DJ scenario: a subscriber asks to be told when a promo release
// goes live. The work resolves inside the discog tables, but the request and
// eligibility path reference it only through a typed WorkRef.
const djRequest: RequestedUpdate = {
  work: {
    kind: 'release',
    id: 'rel_dj_promo_001',
    label: 'Warehouse Promo EP',
  },
  notificationSubscriptionId: 'sub_dj_fan_1',
  channel: 'sms',
  condition: {
    kind: 'release_date_reached',
    verifiedAt: new Date('2026-10-02T00:00:00Z'),
  },
  requestedAt: new Date('2026-09-28T12:00:00Z'),
  domain: { promoPool: 'crates', releaseSourceType: 'spotify' },
};

// A non-music scenario: a podcaster's subscriber asks for a resource
// (e.g. a new episode guide). The account has no Spotify id, no catalog
// import, and no music connector — none are fields of the shared contract.
const podcastRequest: RequestedUpdate = {
  work: {
    kind: 'resource',
    id: 'res_episode_guide_07',
    label: 'Episode 7 resource guide',
  },
  notificationSubscriptionId: 'sub_pod_fan_1',
  channel: 'email',
  condition: verifiedPublished,
  requestedAt: new Date('2026-09-30T09:00:00Z'),
  domain: { feedId: 'feed_abc', episodeGuid: 'ep-7' },
};

describe('requested-update contract (JOV-7506)', () => {
  it('fulfills the DJ request once the release-date condition is verified', () => {
    expect(
      getRequestedUpdateEligibility(
        eligibleInput({ condition: djRequest.condition })
      )
    ).toEqual({ eligible: true, reason: null });
  });

  it('fulfills the podcast-resource request with no music account or credentials', () => {
    expect(
      getRequestedUpdateEligibility(
        eligibleInput({ condition: podcastRequest.condition })
      )
    ).toEqual({ eligible: true, reason: null });
  });

  it('accepts both professions through the same shape without renaming music fields', () => {
    // A mixed-discipline creator needs no permanent DJ/podcaster switch:
    // the same input fields describe both requests.
    for (const request of [djRequest, podcastRequest]) {
      expect(request.notificationSubscriptionId).toBeTruthy();
      expect(
        getRequestedUpdateEligibility(
          eligibleInput({ condition: request.condition })
        ).eligible
      ).toBe(true);
    }
  });

  it('keeps domain metadata on the request without affecting shared eligibility', () => {
    expect(djRequest.domain?.promoPool).toBe('crates');
    expect(podcastRequest.domain?.feedId).toBe('feed_abc');
  });
});

describe('getRequestedUpdateEligibility adverse cases', () => {
  it('blocks a duplicate or replayed fulfillment before any other gate', () => {
    expect(
      getRequestedUpdateEligibility(
        eligibleInput({
          alreadyFulfilled: true,
          isClaimed: false,
          canSendNotifications: false,
          hasVerifiedPermission: false,
          workAvailable: false,
        })
      )
    ).toEqual({ eligible: false, reason: 'already_fulfilled' });
  });

  it('blocks unclaimed profiles', () => {
    expect(
      getRequestedUpdateEligibility(eligibleInput({ isClaimed: false }))
    ).toEqual({ eligible: false, reason: 'profile_not_claimed' });
  });

  it('blocks when notifications are disabled for the creator', () => {
    expect(
      getRequestedUpdateEligibility(
        eligibleInput({ canSendNotifications: false })
      )
    ).toEqual({ eligible: false, reason: 'notifications_disabled' });
  });

  it('blocks a trialing creator at the shared notification limit', () => {
    expect(
      getRequestedUpdateEligibility(
        eligibleInput({
          isTrialing: true,
          trialNotificationsSent: TRIAL_NOTIFICATION_RECIPIENT_LIMIT,
        })
      )
    ).toEqual({ eligible: false, reason: 'trial_exhausted' });
  });

  it('blocks interest after consent is withdrawn (unsubscribed)', () => {
    expect(
      getRequestedUpdateEligibility(
        eligibleInput({ permissionWithdrawn: true })
      )
    ).toEqual({ eligible: false, reason: 'permission_withdrawn' });
  });

  it('blocks interest that was never confirmed (no verified permission)', () => {
    expect(
      getRequestedUpdateEligibility(
        eligibleInput({ hasVerifiedPermission: false })
      )
    ).toEqual({ eligible: false, reason: 'no_verified_permission' });
  });

  it('blocks when the work was unpublished or deleted after the request', () => {
    expect(
      getRequestedUpdateEligibility(eligibleInput({ workAvailable: false }))
    ).toEqual({ eligible: false, reason: 'work_unavailable' });
  });

  it('blocks until the condition is verified', () => {
    expect(
      getRequestedUpdateEligibility(
        eligibleInput({
          condition: { kind: 'release_date_reached', verifiedAt: null },
        })
      )
    ).toEqual({ eligible: false, reason: 'condition_unverified' });
  });
});

describe('isConditionVerified', () => {
  it('treats null or absent verifiedAt as unverified', () => {
    expect(
      isConditionVerified({ kind: 'manual_confirmation', verifiedAt: null })
    ).toBe(false);
    expect(isConditionVerified({ kind: 'work_published' })).toBe(false);
    expect(isConditionVerified(verifiedPublished)).toBe(true);
  });
});

describe('DJ-independent shared boundaries', () => {
  it('the shared module imports no music-only modules', () => {
    const source = readFileSync(
      resolve(WEB_ROOT, 'lib/notifications/requested-updates.ts'),
      'utf8'
    );
    const importLines = source
      .split('\n')
      .filter(line => /^\s*import\s/.test(line));
    expect(importLines.length).toBeGreaterThan(0);
    for (const line of importLines) {
      expect(line).not.toMatch(
        /spotify|discog|dsp-|music-resolver|content['"]|track/i
      );
    }
    // Only the shared entitlement constant is allowed; no providers or senders.
    expect(importLines).toEqual([
      "import { TRIAL_NOTIFICATION_RECIPIENT_LIMIT } from '@/lib/entitlements/registry';",
    ]);
  });

  it('shared consent tables carry no track/release-only foreign keys', () => {
    const musicTables = new Set([
      'discog_releases',
      'discog_recordings',
      'discog_tracks',
      'discog_release_tracks',
      'artists',
      'release_artists',
      'track_artists',
      'recording_artists',
    ]);
    for (const table of [notificationSubscriptions, notificationContacts]) {
      const targets = foreignKeyTargets(table);
      for (const target of targets) {
        expect(musicTables.has(target)).toBe(false);
      }
    }
    // Consent and identity must resolve per creator profile and per shared
    // contact — never through a release, track, or DSP account.
    expect(foreignKeyTargets(notificationSubscriptions)).toEqual([
      'creator_profiles',
    ]);
    expect(foreignKeyTargets(notificationContacts)).toEqual([]);
  });

  it('fan_release_notifications is the specialist module that owns the release FK', () => {
    // The release-scoped delivery queue is a specialist module: it may hold a
    // track-adjacent foreign key, while the shared consent path above may not.
    const targets = foreignKeyTargets(fanReleaseNotifications);
    expect(targets).toContain('discog_releases');
    expect(targets).toContain('notification_subscriptions');
    expect(targets).toContain('creator_profiles');
  });
});

function foreignKeyTargets(table: PgTable): string[] {
  return getTableConfig(table).foreignKeys.map(key =>
    getTableName(key.reference().foreignTable)
  );
}
