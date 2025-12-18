'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import React from 'react';
import type {
  NotificationChannel,
  NotificationContactValues,
  NotificationSubscriptionState,
} from '@/types/notifications';
import {
  formatE164PhoneForDisplay,
  type ProfileNotificationsState,
} from './hooks/useProfileNotificationsController';
import { ProfileNotificationsButton } from './ProfileNotificationsButton';

type ProfileNotificationsMenuProps = {
  channelBusy: Partial<Record<NotificationChannel, boolean>>;
  hasActiveSubscriptions: boolean;
  notificationsState: ProfileNotificationsState;
  onAddChannel: (channel?: NotificationChannel) => void;
  onOpenChange: (open: boolean) => void;
  onUnsubscribe: (channel: NotificationChannel) => void;
  open: boolean;
  subscribedChannels: NotificationSubscriptionState;
  subscriptionDetails: NotificationContactValues;
  triggerRef?: React.RefObject<HTMLButtonElement>;
};

export function ProfileNotificationsMenu({
  channelBusy,
  hasActiveSubscriptions,
  notificationsState,
  onAddChannel,
  onOpenChange,
  onUnsubscribe,
  open,
  subscribedChannels,
  subscriptionDetails,
  triggerRef,
}: ProfileNotificationsMenuProps) {
  const renderChannelMenuItem = (
    targetChannel: NotificationChannel,
    label: string
  ) => {
    const isActive = Boolean(subscribedChannels[targetChannel]);
    const contactValue = subscriptionDetails[targetChannel];
    const isLoading = Boolean(channelBusy[targetChannel]);

    if (isActive) {
      return (
        <DropdownMenuItem
          key={targetChannel}
          className='flex items-start gap-2 focus-visible:outline-none'
          disabled={isLoading}
          onSelect={event => {
            event.preventDefault();
            onUnsubscribe(targetChannel);
          }}
        >
          <div className='flex-1'>
            <p className='text-sm font-semibold text-foreground'>
              {label}{' '}
              <span className='text-xs font-normal text-muted-foreground'>
                (tap to unsubscribe)
              </span>
            </p>
            {contactValue ? (
              <p className='break-all text-xs text-muted-foreground'>
                {targetChannel === 'sms'
                  ? formatE164PhoneForDisplay(contactValue)
                  : contactValue}
              </p>
            ) : null}
          </div>
          <span aria-hidden className='text-primary font-semibold'>
            ✓
          </span>
        </DropdownMenuItem>
      );
    }

    return (
      <DropdownMenuItem
        key={targetChannel}
        className='flex items-start gap-2 focus-visible:outline-none'
        disabled={isLoading}
        onSelect={event => {
          event.preventDefault();
          onAddChannel(targetChannel);
        }}
      >
        <div className='flex-1'>
          <p className='text-sm font-semibold text-foreground'>Add {label}</p>
          <p className='text-xs text-muted-foreground'>
            Stay in the loop via {label.toLowerCase()}.
          </p>
        </div>
        <span aria-hidden className='text-xs text-muted-foreground'>
          +
        </span>
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <div>
          <ProfileNotificationsButton
            ariaExpanded={open}
            buttonRef={triggerRef}
            hasActiveSubscriptions={hasActiveSubscriptions}
            notificationsState={notificationsState}
            onClick={() => onOpenChange(!open)}
          />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        className='w-72 rounded-xl border border-border bg-popover shadow-lg backdrop-blur'
        sideOffset={8}
      >
        <DropdownMenuLabel className='text-sm font-semibold text-foreground'>
          Manage notifications
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {renderChannelMenuItem('sms', 'SMS')}
        {renderChannelMenuItem('email', 'Email')}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled
          className='flex items-start gap-2 cursor-default opacity-70'
        >
          <div className='flex-1'>
            <p className='text-sm font-semibold text-foreground'>
              Instagram DMs
            </p>
            <p className='text-xs text-muted-foreground'>Coming soon</p>
          </div>
          <span aria-hidden className='text-xs text-muted-foreground'>
            …
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
