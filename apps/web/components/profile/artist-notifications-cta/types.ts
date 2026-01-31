import type { Artist } from '@/types/db';

export interface ArtistNotificationsCTAProps {
  readonly artist: Artist;
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
}
