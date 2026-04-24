'use client';

import type { Artist } from '@/types/db';
import { ProfileInlineNotificationsCTA } from './ProfileInlineNotificationsCTA';

interface TwoStepNotificationsCTAProps {
  readonly artist: Artist;
  readonly startExpanded?: boolean;
}

export function TwoStepNotificationsCTA({
  artist,
  startExpanded = false,
}: TwoStepNotificationsCTAProps) {
  return (
    <ProfileInlineNotificationsCTA
      artist={artist}
      variant='button'
      presentation={startExpanded ? 'inline' : 'overlay'}
      autoOpen={startExpanded}
    />
  );
}
