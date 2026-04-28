'use client';

import type { Artist } from '@/types/db';
import { ProfileInlineNotificationsCTA } from './ProfileInlineNotificationsCTA';

interface TwoStepNotificationsCTAProps {
  readonly artist: Artist;
  readonly startExpanded?: boolean;
  readonly presentation?: 'overlay' | 'inline' | 'modal';
  readonly portalContainer?: HTMLElement | null;
  readonly onFlowClosed?: () => void;
  readonly onSubscriptionActivated?: () => void;
}

export function TwoStepNotificationsCTA({
  artist,
  startExpanded = false,
  presentation,
  portalContainer,
  onFlowClosed,
  onSubscriptionActivated,
}: TwoStepNotificationsCTAProps) {
  return (
    <ProfileInlineNotificationsCTA
      artist={artist}
      variant='button'
      presentation={presentation ?? (startExpanded ? 'inline' : 'overlay')}
      portalContainer={portalContainer}
      autoOpen={startExpanded}
      onFlowClosed={onFlowClosed}
      onSubscriptionActivated={onSubscriptionActivated}
    />
  );
}
