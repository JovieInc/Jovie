import { TRIAL_NOTIFICATION_RECIPIENT_LIMIT } from '@/lib/entitlements/registry';

/**
 * Requested-update contract (JOV-7506, boundary approved in JOV-3392).
 *
 * One promise: a verified subscriber asks to be told about a particular work,
 * and the update is fulfilled only after the condition is verified and the
 * subscriber is still eligible at fulfillment time.
 *
 * This module is the profession-agnostic core. It deliberately knows nothing
 * about Spotify, DSPs, tracks, or catalog imports — the existing
 * release-day pipeline (`release-eligibility.ts`,
 * `fan_release_notifications`) is the music specialist module built on the
 * same consent and delivery owner paths, not a second implementation.
 * See docs/features/requested-updates/CONTRACT.md.
 */

/**
 * A typed work reference. `kind` is open text (e.g. 'release', 'episode',
 * 'resource') so a new discipline does not require a schema or enum migration;
 * specialist modules resolve `id` inside their own tables.
 */
export interface WorkRef {
  readonly kind: string;
  readonly id: string;
  readonly label?: string;
}

/**
 * The verified condition that must hold before an update may be fulfilled.
 * `verifiedAt` non-null means the condition has been observed true; a null or
 * absent `verifiedAt` means the request is still waiting.
 */
export type WorkUpdateConditionKind =
  | 'work_published'
  | 'release_date_reached'
  | 'manual_confirmation';

export interface WorkUpdateCondition {
  readonly kind: WorkUpdateConditionKind;
  readonly verifiedAt?: Date | null;
}

export function isConditionVerified(condition: WorkUpdateCondition): boolean {
  return condition.verifiedAt != null;
}

/**
 * A single requested-update promise: interest from one confirmed subscription
 * about one work under one condition. `domain` carries profession-specific
 * metadata (e.g. a DJ's promo pool or a podcaster's feed id) without changing
 * the shared shape.
 */
export interface RequestedUpdate {
  readonly work: WorkRef;
  readonly notificationSubscriptionId: string;
  readonly channel: 'email' | 'sms' | 'push';
  readonly condition: WorkUpdateCondition;
  readonly requestedAt: Date;
  readonly domain?: Record<string, unknown>;
}

export type RequestedUpdateEligibilityReason =
  | 'already_fulfilled'
  | 'profile_not_claimed'
  | 'notifications_disabled'
  | 'trial_exhausted'
  | 'permission_withdrawn'
  | 'no_verified_permission'
  | 'work_unavailable'
  | 'condition_unverified';

export interface RequestedUpdateEligibilityInput {
  /** A fulfillment receipt already exists for this request (dedupe). */
  readonly alreadyFulfilled?: boolean;
  readonly isClaimed: boolean;
  readonly canSendNotifications: boolean;
  readonly isTrialing: boolean;
  readonly trialNotificationsSent?: number | null;
  /** Subscriber unsubscribed or revoked consent after requesting. */
  readonly permissionWithdrawn?: boolean;
  /** Subscription is confirmed and the topic preference covers this update. */
  readonly hasVerifiedPermission: boolean;
  /** The work still exists and is published/visible at fulfillment time. */
  readonly workAvailable: boolean;
  readonly condition: WorkUpdateCondition;
}

/**
 * Fulfillment-time eligibility for a requested update. Pure and symmetric:
 * the same gates apply to a DJ's release promo and a podcaster's resource
 * update, with no profession switch.
 */
export function getRequestedUpdateEligibility(
  input: RequestedUpdateEligibilityInput
):
  | { eligible: true; reason: null }
  | { eligible: false; reason: RequestedUpdateEligibilityReason } {
  if (input.alreadyFulfilled) {
    return { eligible: false, reason: 'already_fulfilled' };
  }

  if (!input.isClaimed) {
    return { eligible: false, reason: 'profile_not_claimed' };
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

  if (input.permissionWithdrawn) {
    return { eligible: false, reason: 'permission_withdrawn' };
  }

  if (!input.hasVerifiedPermission) {
    return { eligible: false, reason: 'no_verified_permission' };
  }

  if (!input.workAvailable) {
    return { eligible: false, reason: 'work_unavailable' };
  }

  if (!isConditionVerified(input.condition)) {
    return { eligible: false, reason: 'condition_unverified' };
  }

  return { eligible: true, reason: null };
}
