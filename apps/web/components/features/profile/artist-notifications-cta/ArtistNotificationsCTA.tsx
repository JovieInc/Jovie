'use client';

import { ProfileInlineNotificationsCTA } from './ProfileInlineNotificationsCTA';
import type { ArtistNotificationsCTAProps } from './types';

export function ArtistNotificationsCTA({
  artist,
  presentation,
  portalContainer,
  variant = 'link',
  autoOpen = false,
  forceExpanded = false,
  hideTrigger = false,
  onFlowClosed,
  source,
}: ArtistNotificationsCTAProps) {
  const resolvedPresentation =
    presentation ?? (autoOpen || forceExpanded ? 'inline' : 'overlay');

  return (
    <ProfileInlineNotificationsCTA
      artist={artist}
      variant={variant}
      presentation={resolvedPresentation}
      portalContainer={portalContainer}
      autoOpen={autoOpen || forceExpanded}
      hideTrigger={hideTrigger}
      onFlowClosed={onFlowClosed}
      source={source}
    />
  );
}
