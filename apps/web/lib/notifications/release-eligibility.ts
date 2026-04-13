import { TRIAL_NOTIFICATION_RECIPIENT_LIMIT } from '@/lib/entitlements/registry';

export type ProfileNotificationReadiness =
  | 'claim_required'
  | 'spotify_required'
  | 'catalog_import_pending'
  | 'waiting_for_release'
  | 'live'
  | 'trial_exhausted'
  | 'conflict_blocked';

export interface ProfileNotificationReadinessInput {
  readonly canSendNotifications: boolean;
  readonly conflictBlocked?: boolean;
  readonly hasEligibleRelease?: boolean;
  readonly isClaimed: boolean;
  readonly isTrialing: boolean;
  readonly spotifyId: string | null;
  readonly spotifyImportStatus?: string | null;
  readonly trialNotificationsSent?: number | null;
}

export type ReleaseNotificationEligibilityReason =
  | 'profile_not_claimed'
  | 'spotify_required'
  | 'catalog_import_pending'
  | 'release_not_spotify_imported'
  | 'notifications_disabled'
  | 'no_verified_subscribers'
  | 'no_smart_link'
  | 'trial_exhausted'
  | 'already_notified';

export interface ReleaseNotificationEligibilityInput {
  readonly alreadyNotified?: boolean;
  readonly canSendNotifications: boolean;
  readonly hasSmartLink: boolean;
  readonly isClaimed: boolean;
  readonly isTrialing: boolean;
  readonly releaseSourceType: string | null;
  readonly spotifyId: string | null;
  readonly spotifyImportStatus?: string | null;
  readonly trialNotificationsSent?: number | null;
  readonly verifiedSubscriberCount: number;
}

export function getProfileNotificationReadiness(
  input: ProfileNotificationReadinessInput
): ProfileNotificationReadiness {
  if (input.conflictBlocked) {
    return 'conflict_blocked';
  }

  if (!input.isClaimed) {
    return 'claim_required';
  }

  if (!input.spotifyId) {
    return 'spotify_required';
  }

  if (
    input.spotifyImportStatus === 'importing' ||
    input.spotifyImportStatus === 'unknown'
  ) {
    return 'catalog_import_pending';
  }

  if (
    input.isTrialing &&
    (input.trialNotificationsSent ?? 0) >= TRIAL_NOTIFICATION_RECIPIENT_LIMIT
  ) {
    return 'trial_exhausted';
  }

  if (!input.canSendNotifications) {
    return 'waiting_for_release';
  }

  if (!input.hasEligibleRelease) {
    return 'waiting_for_release';
  }

  return 'live';
}

export function getReleaseNotificationEligibility(
  input: ReleaseNotificationEligibilityInput
):
  | { eligible: true; reason: null }
  | { eligible: false; reason: ReleaseNotificationEligibilityReason } {
  if (input.alreadyNotified) {
    return { eligible: false, reason: 'already_notified' };
  }

  if (!input.isClaimed) {
    return { eligible: false, reason: 'profile_not_claimed' };
  }

  if (!input.spotifyId) {
    return { eligible: false, reason: 'spotify_required' };
  }

  if (
    input.spotifyImportStatus === 'importing' ||
    input.spotifyImportStatus === 'unknown'
  ) {
    return { eligible: false, reason: 'catalog_import_pending' };
  }

  if (input.releaseSourceType !== 'spotify') {
    return { eligible: false, reason: 'release_not_spotify_imported' };
  }

  if (!input.canSendNotifications) {
    return { eligible: false, reason: 'notifications_disabled' };
  }

  if (
    input.isTrialing &&
    (input.trialNotificationsSent ?? 0) >= TRIAL_NOTIFICATION_RECIPIENT_LIMIT
  ) {
    return { eligible: false, reason: 'trial_exhausted' };
  }

  if (input.verifiedSubscriberCount < 1) {
    return { eligible: false, reason: 'no_verified_subscribers' };
  }

  if (!input.hasSmartLink) {
    return { eligible: false, reason: 'no_smart_link' };
  }

  return { eligible: true, reason: null };
}
