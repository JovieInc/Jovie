import type { ProfileAlertOptInVariant } from '@/lib/flags/contracts';
import type { Artist } from '@/types/db';

export type NotificationSource =
  | 'profile_inline'
  | 'tour_drawer'
  | 'home_alerts_card'
  | 'hero_alerts_button'
  | 'music_empty_state'
  | 'events_empty_state'
  | 'subscribe_tab';

export type NotificationSourceTab = 'home' | 'music' | 'events' | 'alerts';

export type NotificationIntent =
  | 'music_alerts'
  | 'event_alerts'
  | 'general_alerts';

export interface NotificationSourceContext {
  readonly artistId?: string;
  readonly profileId?: string;
  readonly profileSlug?: string;
  readonly currentTab: NotificationSourceTab;
  readonly ctaLocation: NotificationSource;
  readonly intent: NotificationIntent;
  readonly releaseId?: string;
  readonly eventId?: string;
}

export function buildNotificationSourceContext(
  artist: Artist,
  context: NotificationSourceContext
) {
  return {
    artist_id: context.artistId ?? artist.id,
    profile_id: context.profileId ?? artist.id,
    profile_slug: context.profileSlug ?? artist.handle,
    handle: artist.handle,
    current_route_tab: context.currentTab,
    cta_location: context.ctaLocation,
    intent: context.intent,
    release_id: context.releaseId,
    event_id: context.eventId,
  };
}

export function resolveNotificationSource(
  source: NotificationSource | undefined,
  context: NotificationSourceContext | undefined
): NotificationSource {
  return source ?? context?.ctaLocation ?? 'profile_inline';
}

export interface ArtistNotificationsCTAProps {
  readonly artist: Artist;
  readonly presentation?: 'overlay' | 'inline' | 'modal';
  readonly portalContainer?: HTMLElement | null;
  /**
   * Controls the base rendering style when notifications are disabled or idle.
   * "link" matches the static profile button, "button" matches CTAButton.
   */
  readonly variant?: 'link' | 'button';
  /**
   * When true, automatically opens the subscription form on mount.
   * Used for /handle/subscribe route.
   */
  readonly autoOpen?: boolean;
  /**
   * When true, keep the subscription form visible instead of rendering the
   * listen fallback CTA.
   */
  readonly forceExpanded?: boolean;
  /**
   * When true, suppress the inline listen fallback for conversion-first
   * profile surfaces.
   */
  readonly hideListenFallback?: boolean;
  readonly hideTrigger?: boolean;
  readonly onFlowClosed?: () => void;
  readonly onSubscriptionActivated?: () => void;
  readonly experimentVariant?: ProfileAlertOptInVariant;
  /**
   * Analytics source identifier for tracking where subscriptions originate.
   * Defaults to 'profile_inline'. Tour drawer passes 'tour_drawer'.
   */
  readonly source?: NotificationSource;
  readonly sourceContext?: NotificationSourceContext;
  readonly triggerLabel?: string;
  /**
   * Optional override for the trigger button's className. Used by surface
   * empty states that need the trigger on the unified 36px CTA scale instead
   * of the default 48px pill.
   */
  readonly triggerClassName?: string;
}
