'use client';

import type { ProfileAlertOptInVariant } from '@/lib/flags/contracts';
import type { Artist } from '@/types/db';
import { ProfileInlineNotificationsCTA } from './ProfileInlineNotificationsCTA';
import type { NotificationSource } from './types';

interface TwoStepNotificationsCTAProps {
  readonly artist: Artist;
  readonly startExpanded?: boolean;
  readonly presentation?: 'overlay' | 'inline' | 'modal';
  readonly portalContainer?: HTMLElement | null;
  readonly onFlowClosed?: () => void;
  readonly onSubscriptionActivated?: () => void;
  readonly experimentVariant?: ProfileAlertOptInVariant;
  readonly source?: NotificationSource;
}

export function TwoStepNotificationsCTA({
  artist,
  startExpanded = false,
  presentation,
  portalContainer,
  onFlowClosed,
  onSubscriptionActivated,
  experimentVariant,
  source,
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
      experimentVariant={experimentVariant}
      source={source}
    />
  );
}
