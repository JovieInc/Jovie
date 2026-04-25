'use client';

import type { Artist } from '@/types/db';
import { ProfileInlineNotificationsCTA } from './ProfileInlineNotificationsCTA';

interface TwoStepNotificationsCTAProps {
  readonly artist: Artist;
  readonly startExpanded?: boolean;
  readonly presentation?: 'overlay' | 'inline';
}

export function TwoStepNotificationsCTA({
  artist,
  startExpanded = false,
  presentation,
}: TwoStepNotificationsCTAProps) {
  return (
    <ProfileInlineNotificationsCTA
      artist={artist}
      variant='button'
      presentation={presentation ?? (startExpanded ? 'inline' : 'overlay')}
      autoOpen={startExpanded}
    />
  );
}
