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
import { ProfileNotificationsButton } from './ProfileNotificationsButton';

function formatE164PhoneForDisplay(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return value;

  if (digits.startsWith('1') && digits.length === 11) {
    const national = digits.slice(1);
    const part1 = national.slice(0, 3);
    const part2 = national.slice(3, 6);
    const part3 = national.slice(6, 10);
    return `+1 (${part1}) ${part2}-${part3}`;
  }

  if (value.startsWith('+')) {
    const grouped = digits.match(/.{1,3}/g);
    return grouped ? `+${grouped.join(' ')}` : value;
  }

  return value;
}

interface ProfileNotificationsMenuProps {
  isOpen: boolean;
  isSubscribed: boolean;
  subscribedChannels: NotificationSubscriptionState;
  subscriptionDetails: NotificationContactValues;
  channelBusy: Partial<Record<NotificationChannel, boolean>>;
  onOpenChange: (open: boolean) => void;
  onAddChannel: (channel: NotificationChannel) => void;
  onUnsubscribe: (channel: NotificationChannel) => void;
}

function MenuChannelItem({
  channel,
  label,
  isActive,
  contactValue,
  isBusy,
  onAdd,
  onUnsubscribe,
}: {
  channel: NotificationChannel;
  label: string;
  isActive: boolean;
  contactValue?: string;
  isBusy: boolean;
  onAdd: (channel: NotificationChannel) => void;
  onUnsubscribe: (channel: NotificationChannel) => void;
}) {
  if (isActive) {
    return (
      <DropdownMenuItem
        key={channel}
        className='flex items-start gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
        disabled={isBusy}
        onSelect={event => {
          event.preventDefault();
          onUnsubscribe(channel);
        }}
      >
        <div className='flex-1 space-y-1'>
          <p className='text-sm font-semibold text-foreground'>
            {label}{' '}
            <span className='text-xs font-normal text-muted-foreground'>
              (tap to unsubscribe)
            </span>
          </p>
          {contactValue ? (
            <p className='break-all text-xs text-muted-foreground'>
              {channel === 'phone'
                ? formatE164PhoneForDisplay(contactValue)
                : contactValue}
            </p>
          ) : null}
        </div>
        <span aria-hidden className='text-sm font-semibold text-primary'>
          ✓
        </span>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem
      key={channel}
      className='flex items-start gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
      disabled={isBusy}
      onSelect={event => {
        event.preventDefault();
        onAdd(channel);
      }}
    >
      <div className='flex-1 space-y-1'>
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
}

export function ProfileNotificationsMenu({
  channelBusy,
  isOpen,
  isSubscribed,
  onAddChannel,
  onOpenChange,
  onUnsubscribe,
  subscribedChannels,
  subscriptionDetails,
}: ProfileNotificationsMenuProps) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <ProfileNotificationsButton
          aria-label='Manage notification channels'
          isOpen={isOpen}
          isSubscribed={isSubscribed}
          ref={triggerRef}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        sideOffset={8}
        className='w-72 rounded-xl border border-border bg-popover p-2 shadow-lg backdrop-blur'
        onCloseAutoFocus={event => {
          if (!triggerRef.current) return;
          event.preventDefault();
          triggerRef.current.focus();
        }}
      >
        <DropdownMenuLabel className='text-xs uppercase tracking-wide text-muted-foreground'>
          Notifications
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <MenuChannelItem
          channel='phone'
          label='SMS'
          contactValue={subscriptionDetails.phone}
          isActive={Boolean(subscribedChannels.phone)}
          isBusy={Boolean(channelBusy.phone)}
          onAdd={onAddChannel}
          onUnsubscribe={onUnsubscribe}
        />
        <MenuChannelItem
          channel='email'
          label='Email'
          contactValue={subscriptionDetails.email}
          isActive={Boolean(subscribedChannels.email)}
          isBusy={Boolean(channelBusy.email)}
          onAdd={onAddChannel}
          onUnsubscribe={onUnsubscribe}
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled
          className='flex items-start gap-2 cursor-default opacity-70'
        >
          <div className='flex-1 space-y-1'>
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
