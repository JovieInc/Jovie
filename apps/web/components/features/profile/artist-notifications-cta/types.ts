import type { Artist } from '@/types/db';

export type NotificationSource = 'profile_inline' | 'tour_drawer';

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
  /**
   * Analytics source identifier for tracking where subscriptions originate.
   * Defaults to 'profile_inline'. Tour drawer passes 'tour_drawer'.
   */
  readonly source?: NotificationSource;
}
