import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverAnalyticsEvents } from '@/lib/db/schema/analytics';
import {
  type ServerAnalyticsDelivery,
  trackServerEvent,
} from '@/lib/server-analytics';

/**
 * Server-side state for the Artist Presence ($199/mo) upgrade offer shown once
 * per claimed artist after their first profile claim during onboarding
 * (JOV-6675). Receipts persist in the append-only server funnel ledger
 * (JOV-6459) keyed by creator_profile, so the seen/accepted/dismissed state
 * survives sessions, devices, and re-renders — the offer can never nag twice.
 */
export const ONBOARDING_UPGRADE_OFFER_EVENTS = {
  seen: 'onboarding_upgrade_offer_seen',
  accepted: 'onboarding_upgrade_offer_accepted',
  dismissed: 'onboarding_upgrade_offer_dismissed',
} as const;

export type OnboardingUpgradeOfferKind =
  keyof typeof ONBOARDING_UPGRADE_OFFER_EVENTS;

/**
 * True when this profile already has any offer receipt (seen, accepted, or
 * dismissed). Callers suppress the offer so it surfaces exactly once.
 */
export async function hasOnboardingUpgradeOfferState(
  profileId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: serverAnalyticsEvents.id })
    .from(serverAnalyticsEvents)
    .where(
      and(
        eq(serverAnalyticsEvents.sourceEntityType, 'creator_profile'),
        eq(serverAnalyticsEvents.sourceEntityId, profileId),
        inArray(serverAnalyticsEvents.eventName, [
          ONBOARDING_UPGRADE_OFFER_EVENTS.seen,
          ONBOARDING_UPGRADE_OFFER_EVENTS.accepted,
          ONBOARDING_UPGRADE_OFFER_EVENTS.dismissed,
        ])
      )
    )
    .limit(1);

  return rows.length > 0;
}

export async function recordOnboardingUpgradeOfferEvent(
  profileId: string,
  kind: OnboardingUpgradeOfferKind,
  plan: string
): Promise<ServerAnalyticsDelivery> {
  return trackServerEvent(ONBOARDING_UPGRADE_OFFER_EVENTS[kind], {
    profileId,
    plan,
  });
}
