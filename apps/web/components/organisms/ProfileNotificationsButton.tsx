'use client';

import { Bell } from 'lucide-react';
import React from 'react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import type { ProfileNotificationsState } from './hooks/useProfileNotificationsController';

type ProfileNotificationsButtonProps = {
  hasActiveSubscriptions: boolean;
  notificationsState: ProfileNotificationsState;
  onClick: () => void;
  ariaExpanded?: boolean;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
};

export function ProfileNotificationsButton({
  ariaExpanded,
  buttonRef,
  hasActiveSubscriptions,
  notificationsState,
  onClick,
}: ProfileNotificationsButtonProps) {
  const isEditing = notificationsState === 'editing';

  return (
    <CircleIconButton
      ref={buttonRef}
      size='xs'
      variant='frosted'
      className='relative'
      aria-expanded={ariaExpanded}
      ariaLabel={
        hasActiveSubscriptions
          ? 'Manage notification preferences'
          : 'Subscribe to notifications'
      }
      aria-pressed={isEditing}
      onClick={onClick}
    >
      <Bell className='h-4 w-4 text-primary-token' aria-hidden='true' />
      {hasActiveSubscriptions ? (
        <span
          aria-hidden
          className='absolute -right-1 -top-1 inline-flex h-2.5 w-2.5 rounded-full bg-primary'
        />
      ) : null}
    </CircleIconButton>
  );
}
