'use client';

import type { ProfileAlertOptInVariant } from '@/lib/flags/contracts';
import type { Artist } from '@/types/db';
import { ArtistNotificationsCTA } from '../artist-notifications-cta/ArtistNotificationsCTA';
import { TwoStepNotificationsCTA } from '../artist-notifications-cta/TwoStepNotificationsCTA';
import type { NotificationSource } from '../artist-notifications-cta/types';

/**
 * Canonical subscribe form for the `?mode=subscribe` (Alerts) tab panel.
 *
 * Covers all states from the spec §4 Alert/Subscribe Contract:
 *   - idle       — not yet subscribed, trigger button shown (label: "Get alerts")
 *   - validating — OTP verification step
 *   - submitting — API call in-flight
 *   - success    — subscription confirmed; "You're all set" shown
 *   - error      — inline error message; form fields preserved
 *   - retry      — user can re-submit after error
 *
 * Analytics events are emitted inside `useSubscriptionForm` via the canonical
 * event set defined in spec §4.8. Do NOT add new subscribe-adjacent events here.
 *
 * Spec: docs/public-profile-surface-spec.md §4, §5
 */
export interface SubscribeFormProps {
  readonly artist: Artist;
  /**
   * Whether to render the two-step email → SMS flow.
   * Gated by Pro entitlement at the call-site.
   */
  readonly twoStep?: boolean;
  /**
   * Present the form inline (fully expanded) or as an overlay (triggered
   * by a button click). Inline is used in the tab panel; overlay in drawers.
   */
  readonly presentation?: 'inline' | 'overlay';
  /**
   * Experiment variant for the alert opt-in UI.
   * Forwarded to the underlying form without modification.
   */
  readonly experimentVariant?: ProfileAlertOptInVariant;
  /**
   * Analytics source tag. Defaults to `'profile_inline'`.
   */
  readonly source?: NotificationSource;
  readonly portalContainer?: HTMLElement | null;
  readonly onFlowClosed?: () => void;
  readonly onSubscriptionActivated?: () => void;
}

/**
 * Canonical subscribe/alerts form component.
 *
 * This is the single canonical entry point for the subscribe flow in the
 * profile surface (§4.5: "The inline form at ?mode=subscribe is the
 * in-profile entry point"). The full-page campaign landing is
 * `AlertGrowthLanding` at `/{username}/alerts`.
 *
 * Do NOT create additional subscribe surfaces. If a new surface is needed,
 * deprecate one of the existing ones first (spec §4.5).
 */
export function SubscribeForm({
  artist,
  twoStep = false,
  presentation = 'inline',
  experimentVariant,
  source,
  portalContainer,
  onFlowClosed,
  onSubscriptionActivated,
}: SubscribeFormProps) {
  if (twoStep) {
    return (
      <TwoStepNotificationsCTA
        artist={artist}
        startExpanded={presentation === 'inline'}
        presentation={presentation}
        portalContainer={portalContainer}
        onFlowClosed={onFlowClosed}
        onSubscriptionActivated={onSubscriptionActivated}
        experimentVariant={experimentVariant}
        source={source}
      />
    );
  }

  return (
    <ArtistNotificationsCTA
      artist={artist}
      variant='button'
      presentation={presentation}
      autoOpen={presentation === 'inline'}
      forceExpanded={presentation === 'inline'}
      portalContainer={portalContainer}
      onFlowClosed={onFlowClosed}
      onSubscriptionActivated={onSubscriptionActivated}
      experimentVariant={experimentVariant}
      source={source}
    />
  );
}
