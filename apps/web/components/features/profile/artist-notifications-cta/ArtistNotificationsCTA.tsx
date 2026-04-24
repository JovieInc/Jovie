'use client';

import { ProfileInlineNotificationsCTA } from './ProfileInlineNotificationsCTA';
import type { ArtistNotificationsCTAProps } from './types';

export function ArtistNotificationsCTA({
  artist,
  variant = 'link',
  autoOpen = false,
  forceExpanded = false,
  source,
}: ArtistNotificationsCTAProps) {
  return (
    <ProfileInlineNotificationsCTA
      artist={artist}
      variant={variant}
      presentation={autoOpen || forceExpanded ? 'inline' : 'overlay'}
      autoOpen={autoOpen || forceExpanded}
      source={source}
    />
  );
}
