'use client';

import { IconButton, SimpleTooltip } from '@jovie/ui';
import { Bell } from 'lucide-react';
import React from 'react';
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
    <IconButton
      ref={buttonRef}
      size='lg'
      variant={isActive ? 'pearl' : 'pearlQuiet'}
      aria-expanded={ariaExpanded}
      ariaLabel={
        hasActiveSubscriptions
          ? 'Manage notification preferences'
          : 'Get alerts'
      }
      aria-pressed={isEditing}
      onClick={onClick}
      className='relative'
    >
      <Bell
        className={
          isActive
            ? 'size-profile-notification-icon fill-current text-primary-token'
            : 'size-profile-notification-icon text-primary-token/84'
        }
        aria-hidden='true'
      />
    </IconButton>
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
