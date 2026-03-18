'use client';

import { SimpleTooltip } from '@jovie/ui';
import { Bell } from 'lucide-react';
import React from 'react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import type { NotificationSubscriptionState } from '@/types/notifications';
import type { ProfileNotificationsState } from './hooks/useProfileNotificationsController';

type ProfileNotificationsButtonProps = {
  readonly hasActiveSubscriptions: boolean;
  readonly notificationsState: ProfileNotificationsState;
  readonly onClick: () => void;
  readonly ariaExpanded?: boolean;
  readonly buttonRef?: React.RefObject<HTMLButtonElement | null>;
  readonly subscribedChannels?: NotificationSubscriptionState;
};

function getTooltipLabel(channels?: NotificationSubscriptionState): string {
  const hasEmail = Boolean(channels?.email);
  const hasSms = Boolean(channels?.sms);

  if (hasEmail && hasSms) return 'Subscribed via Email & SMS';
  if (hasEmail) return 'Subscribed via Email';
  if (hasSms) return 'Subscribed via SMS';
  return 'Subscribed';
}

export function ProfileNotificationsButton({
  ariaExpanded,
  buttonRef,
  hasActiveSubscriptions,
  notificationsState,
  onClick,
  subscribedChannels,
}: ProfileNotificationsButtonProps) {
  const isEditing = notificationsState === 'editing';
  const isActive = hasActiveSubscriptions;

  const button = (
    <CircleIconButton
      ref={buttonRef}
      size='xs'
      variant='frosted'
      className='relative'
      aria-expanded={ariaExpanded}
      ariaLabel={
        hasActiveSubscriptions
          ? 'Manage notification preferences'
          : 'Get notified'
      }
      aria-pressed={isEditing}
      onClick={onClick}
    >
      <Bell
        className={
          isActive
            ? 'h-4 w-4 fill-current text-accent'
            : 'h-4 w-4 text-primary-token'
        }
        aria-hidden='true'
      />
    </CircleIconButton>
  );

  if (hasActiveSubscriptions) {
    return (
      <SimpleTooltip
        content={getTooltipLabel(subscribedChannels)}
        side='bottom'
      >
        {button}
      </SimpleTooltip>
    );
  }

  return button;
}
