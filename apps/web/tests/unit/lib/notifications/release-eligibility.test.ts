import { describe, expect, it } from 'vitest';
import { TRIAL_NOTIFICATION_RECIPIENT_LIMIT } from '@/lib/entitlements/registry';
import {
  getProfileNotificationReadiness,
  getReleaseNotificationEligibility,
  type ProfileNotificationReadinessInput,
  type ReleaseNotificationEligibilityInput,
} from '@/lib/notifications/release-eligibility';

function eligibilityInput(
  overrides: Partial<ReleaseNotificationEligibilityInput> = {}
): ReleaseNotificationEligibilityInput {
  return {
    alreadyNotified: false,
    canSendNotifications: true,
    hasSmartLink: true,
    isClaimed: true,
    isTrialing: false,
    releaseSourceType: 'spotify',
    spotifyId: 'spotify_1',
    spotifyImportStatus: 'complete',
    trialNotificationsSent: 0,
    verifiedSubscriberCount: 1,
    ...overrides,
  };
}

function readinessInput(
  overrides: Partial<ProfileNotificationReadinessInput> = {}
): ProfileNotificationReadinessInput {
  return {
    canSendNotifications: true,
    conflictBlocked: false,
    hasEligibleRelease: true,
    isClaimed: true,
    isTrialing: false,
    spotifyId: 'spotify_1',
    spotifyImportStatus: 'complete',
    trialNotificationsSent: 0,
    ...overrides,
  };
}

describe('getReleaseNotificationEligibility', () => {
  it('is eligible when every gate passes', () => {
    expect(getReleaseNotificationEligibility(eligibilityInput())).toEqual({
      eligible: true,
      reason: null,
    });
  });

  it('blocks on alreadyNotified before any other check, even when every other gate would fail', () => {
    // EVERY downstream gate is armed to fail — including the trial-limit gate
    // (isTrialing + sent >= limit). If any check is reordered above
    // alreadyNotified, a different reason surfaces and this test fails.
    expect(
      getReleaseNotificationEligibility(
        eligibilityInput({
          alreadyNotified: true,
          isClaimed: false,
          spotifyId: null,
          spotifyImportStatus: 'importing',
          releaseSourceType: 'manual',
          canSendNotifications: false,
          isTrialing: true,
          trialNotificationsSent: TRIAL_NOTIFICATION_RECIPIENT_LIMIT,
          verifiedSubscriberCount: 0,
          hasSmartLink: false,
        })
      )
    ).toEqual({ eligible: false, reason: 'already_notified' });
  });

  it('blocks unclaimed profiles', () => {
    expect(
      getReleaseNotificationEligibility(eligibilityInput({ isClaimed: false }))
    ).toEqual({ eligible: false, reason: 'profile_not_claimed' });
  });

  it('requires a linked Spotify id', () => {
    expect(
      getReleaseNotificationEligibility(eligibilityInput({ spotifyId: null }))
    ).toEqual({ eligible: false, reason: 'spotify_required' });
  });

  it('blocks while the Spotify catalog import is in progress', () => {
    expect(
      getReleaseNotificationEligibility(
        eligibilityInput({ spotifyImportStatus: 'importing' })
      )
    ).toEqual({ eligible: false, reason: 'catalog_import_pending' });
  });

  it('blocks while the Spotify catalog import status is unknown', () => {
    expect(
      getReleaseNotificationEligibility(
        eligibilityInput({ spotifyImportStatus: 'unknown' })
      )
    ).toEqual({ eligible: false, reason: 'catalog_import_pending' });
  });

  it('does not block on other in-progress import statuses (only importing/unknown gate)', () => {
    expect(
      getReleaseNotificationEligibility(
        eligibilityInput({ spotifyImportStatus: 'complete' })
      ).eligible
    ).toBe(true);
  });

  it('blocks releases that were not sourced from Spotify', () => {
    expect(
      getReleaseNotificationEligibility(
        eligibilityInput({ releaseSourceType: 'manual' })
      )
    ).toEqual({ eligible: false, reason: 'release_not_spotify_imported' });
  });

  it('blocks null release source type as not-Spotify-imported', () => {
    expect(
      getReleaseNotificationEligibility(
        eligibilityInput({ releaseSourceType: null })
      )
    ).toEqual({ eligible: false, reason: 'release_not_spotify_imported' });
  });

  it('blocks when notifications are disabled for the creator', () => {
    expect(
      getReleaseNotificationEligibility(
        eligibilityInput({ canSendNotifications: false })
      )
    ).toEqual({ eligible: false, reason: 'notifications_disabled' });
  });

  it('blocks a trialing creator once trialNotificationsSent reaches the limit', () => {
    expect(
      getReleaseNotificationEligibility(
        eligibilityInput({
          isTrialing: true,
          trialNotificationsSent: TRIAL_NOTIFICATION_RECIPIENT_LIMIT,
        })
      )
    ).toEqual({ eligible: false, reason: 'trial_exhausted' });
  });

  it('allows a trialing creator exactly one notification below the limit', () => {
    expect(
      getReleaseNotificationEligibility(
        eligibilityInput({
          isTrialing: true,
          trialNotificationsSent: TRIAL_NOTIFICATION_RECIPIENT_LIMIT - 1,
        })
      ).eligible
    ).toBe(true);
  });

  it('does not apply the trial limit to a non-trialing creator, even over the threshold', () => {
    expect(
      getReleaseNotificationEligibility(
        eligibilityInput({
          isTrialing: false,
          trialNotificationsSent: TRIAL_NOTIFICATION_RECIPIENT_LIMIT + 5,
        })
      ).eligible
    ).toBe(true);
  });

  it('treats a null trialNotificationsSent as 0 (does not block a trialing creator)', () => {
    expect(
      getReleaseNotificationEligibility(
        eligibilityInput({ isTrialing: true, trialNotificationsSent: null })
      ).eligible
    ).toBe(true);
  });

  it('blocks releases with zero verified subscribers', () => {
    expect(
      getReleaseNotificationEligibility(
        eligibilityInput({ verifiedSubscriberCount: 0 })
      )
    ).toEqual({ eligible: false, reason: 'no_verified_subscribers' });
  });

  it('allows exactly one verified subscriber', () => {
    expect(
      getReleaseNotificationEligibility(
        eligibilityInput({ verifiedSubscriberCount: 1 })
      ).eligible
    ).toBe(true);
  });

  it('blocks releases with no smart link even when subscribers exist', () => {
    expect(
      getReleaseNotificationEligibility(
        eligibilityInput({ hasSmartLink: false, verifiedSubscriberCount: 10 })
      )
    ).toEqual({ eligible: false, reason: 'no_smart_link' });
  });
});

describe('getProfileNotificationReadiness', () => {
  it('is live when every gate passes', () => {
    expect(getProfileNotificationReadiness(readinessInput())).toBe('live');
  });

  it('reports conflict_blocked before any other check', () => {
    // EVERY downstream gate is armed to fail — including the trial-limit gate
    // (isTrialing + sent >= limit). If any check is reordered above
    // conflictBlocked, a different readiness surfaces and this test fails.
    expect(
      getProfileNotificationReadiness(
        readinessInput({
          conflictBlocked: true,
          isClaimed: false,
          spotifyId: null,
          spotifyImportStatus: 'importing',
          isTrialing: true,
          trialNotificationsSent: TRIAL_NOTIFICATION_RECIPIENT_LIMIT,
          canSendNotifications: false,
          hasEligibleRelease: false,
        })
      )
    ).toBe('conflict_blocked');
  });

  it('reports claim_required for unclaimed profiles', () => {
    expect(
      getProfileNotificationReadiness(readinessInput({ isClaimed: false }))
    ).toBe('claim_required');
  });

  it('reports spotify_required when no Spotify id is linked', () => {
    expect(
      getProfileNotificationReadiness(readinessInput({ spotifyId: null }))
    ).toBe('spotify_required');
  });

  it('reports catalog_import_pending while importing', () => {
    expect(
      getProfileNotificationReadiness(
        readinessInput({ spotifyImportStatus: 'importing' })
      )
    ).toBe('catalog_import_pending');
  });

  it('reports catalog_import_pending when import status is unknown', () => {
    expect(
      getProfileNotificationReadiness(
        readinessInput({ spotifyImportStatus: 'unknown' })
      )
    ).toBe('catalog_import_pending');
  });

  it('reports trial_exhausted once a trialing creator hits the notification limit', () => {
    expect(
      getProfileNotificationReadiness(
        readinessInput({
          isTrialing: true,
          trialNotificationsSent: TRIAL_NOTIFICATION_RECIPIENT_LIMIT,
        })
      )
    ).toBe('trial_exhausted');
  });

  it('does not apply the trial limit to a non-trialing creator', () => {
    expect(
      getProfileNotificationReadiness(
        readinessInput({
          isTrialing: false,
          trialNotificationsSent: TRIAL_NOTIFICATION_RECIPIENT_LIMIT + 5,
        })
      )
    ).toBe('live');
  });

  it('treats a null trialNotificationsSent as 0 (trialing creator stays live)', () => {
    expect(
      getProfileNotificationReadiness(
        readinessInput({ isTrialing: true, trialNotificationsSent: null })
      )
    ).toBe('live');
  });

  it('reports waiting_for_release when notifications are disabled', () => {
    expect(
      getProfileNotificationReadiness(
        readinessInput({ canSendNotifications: false })
      )
    ).toBe('waiting_for_release');
  });

  it('reports waiting_for_release when there is no eligible release yet, even if sending is allowed', () => {
    expect(
      getProfileNotificationReadiness(
        readinessInput({ hasEligibleRelease: false })
      )
    ).toBe('waiting_for_release');
  });
});
