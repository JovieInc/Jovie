'use client';

import { ArtistNotificationsCTA } from '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA';
import { TwoStepNotificationsCTA } from '@/features/profile/artist-notifications-cta/TwoStepNotificationsCTA';
import type { Artist } from '@/types/db';

export interface SubscribeViewProps {
  readonly artist: Artist;
  /**
   * Use the two-step email→SMS flow. Gated at call-site by pro entitlement.
   * When false, the legacy single-step email CTA renders.
   */
  readonly subscribeTwoStep?: boolean;
}

/**
 * Body of the `subscribe` mode: notifications opt-in.
 *
 * Pure view component — no title or shell. The enclosing wrapper owns chrome.
 */
export function SubscribeView({
  artist,
  subscribeTwoStep = false,
}: SubscribeViewProps) {
  if (subscribeTwoStep) {
    return <TwoStepNotificationsCTA artist={artist} />;
  }
  return <ArtistNotificationsCTA artist={artist} variant='button' autoOpen />;
}
