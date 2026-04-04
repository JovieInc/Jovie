import type { Artist } from '@/types/db';

export interface ArtistNotificationsCTAProps {
  readonly artist: Artist;
  /**
   * Controls the base rendering style when notifications are disabled or idle.
   * "link" matches the static profile button, "button" matches CTAButton.
   */
  readonly variant?: 'link' | 'button' | 'compact';
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
}
