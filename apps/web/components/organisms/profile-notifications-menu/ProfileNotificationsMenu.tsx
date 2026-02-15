'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Switch,
} from '@jovie/ui';
import { useCallback, useEffect, useState } from 'react';
import { useUpdateContentPreferencesMutation } from '@/lib/queries';
import {
  NOTIFICATION_CONTENT_TYPES,
  type NotificationChannel,
  type NotificationContentType,
} from '@/types/notifications';
import { formatE164PhoneForDisplay } from '../hooks/useProfileNotificationsController';
import { ProfileNotificationsButton } from '../ProfileNotificationsButton';
import type { ProfileNotificationsMenuProps } from './types';
import { useNotificationConfirm } from './useNotificationConfirm';
import { labelForChannel } from './utils';

type ContentPrefs = Record<NotificationContentType, boolean>;

const DEFAULT_CONTENT_PREFS: ContentPrefs = {
  newMusic: true,
  tourDates: true,
  merch: true,
  general: true,
};

export function ProfileNotificationsMenu({
  artistId,
  channelBusy,
  contentPreferences,
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
  const {
    confirmChannel,
    isConfirming,
    openConfirmDialog,
    closeConfirmDialog,
    handleConfirm,
  } = useNotificationConfirm();

  const updatePrefsMutation = useUpdateContentPreferencesMutation();

  // Initialize from server-provided preferences, falling back to defaults
  const [contentPrefs, setContentPrefs] = useState<ContentPrefs>(() => ({
    ...DEFAULT_CONTENT_PREFS,
    ...contentPreferences,
  }));

  // Sync when server preferences change (e.g. after status re-fetch)
  useEffect(() => {
    if (contentPreferences) {
      setContentPrefs(prev => ({ ...prev, ...contentPreferences }));
    }
  }, [contentPreferences]);

  const handleContentToggle = useCallback(
    (key: NotificationContentType) => {
      setContentPrefs(prev => {
        const next = { ...prev, [key]: !prev[key] };

        // Fire-and-forget persist to server
        updatePrefsMutation.mutate({
          artistId,
          email: subscriptionDetails.email,
          phone: subscriptionDetails.sms,
          preferences: { [key]: next[key] },
        });

        return next;
      });
    },
    [
      artistId,
      subscriptionDetails.email,
      subscriptionDetails.sms,
      updatePrefsMutation,
    ]
  );

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
            onOpenChange(false);
            openConfirmDialog(targetChannel);
          }}
        >
          <div className='flex-1'>
            <p className='text-sm font-semibold text-primary-token'>
              {label}{' '}
              <span className='text-xs font-normal text-tertiary-token'>
                (tap to unsubscribe)
              </span>
            </p>
            {contactValue ? (
              <p className='break-all text-xs text-tertiary-token'>
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
          onOpenChange(false);
          onAddChannel(targetChannel);
        }}
      >
        <div className='flex-1'>
          <p className='text-sm font-semibold text-primary-token'>
            Add {label}
          </p>
          <p className='text-xs text-tertiary-token'>
            Stay in the loop via {label.toLowerCase()}.
          </p>
        </div>
        <span aria-hidden className='text-xs text-tertiary-token'>
          +
        </span>
      </DropdownMenuItem>
    );
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
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
        <DropdownMenuContent align='end' className='w-72' sideOffset={8}>
          {/* ── Channels ─────────────────────────────── */}
          <DropdownMenuLabel className='text-sm font-semibold text-primary-token'>
            How you get notified
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
              <p className='text-sm font-semibold text-primary-token'>
                Instagram DMs
              </p>
              <p className='text-xs text-tertiary-token'>Coming soon</p>
            </div>
            <span aria-hidden className='text-xs text-tertiary-token'>
              …
            </span>
          </DropdownMenuItem>

          {/* ── Content types ────────────────────────── */}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className='text-sm font-semibold text-primary-token'>
            What you hear about
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {NOTIFICATION_CONTENT_TYPES.map(({ key, label, description }) => (
            <DropdownMenuItem
              key={key}
              className='flex items-center gap-3 focus-visible:outline-none'
              onSelect={event => {
                // Prevent menu from closing on toggle
                event.preventDefault();
                handleContentToggle(key);
              }}
            >
              <div className='flex-1 min-w-0'>
                <p className='text-sm font-semibold text-primary-token'>
                  {label}
                </p>
                <p className='text-xs text-tertiary-token truncate'>
                  {description}
                </p>
              </div>
              <Switch
                checked={contentPrefs[key]}
                onCheckedChange={() => handleContentToggle(key)}
                aria-label={`${label} notifications`}
                className='shrink-0'
              />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={confirmChannel !== null}
        onOpenChange={nextOpen => {
          if (!nextOpen) {
            closeConfirmDialog();
          }
        }}
      >
        <AlertDialogContent className='max-w-md rounded-2xl'>
          <AlertDialogHeader className='gap-2'>
            <AlertDialogTitle className='text-base font-semibold text-primary-token'>
              {confirmChannel
                ? `Unsubscribe from ${labelForChannel(confirmChannel)}`
                : 'Unsubscribe'}
            </AlertDialogTitle>
            <AlertDialogDescription className='text-sm text-secondary-token'>
              {confirmChannel
                ? `You will stop receiving ${labelForChannel(confirmChannel).toLowerCase()} updates from this artist.`
                : 'You will stop receiving updates from this artist.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className='gap-2 sm:gap-2'>
            <AlertDialogCancel
              disabled={isConfirming}
              className='flex-1 sm:flex-none'
            >
              Keep
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={isConfirming || confirmChannel === null}
              className='flex-1 sm:flex-none'
              onClick={() => handleConfirm(onUnsubscribe)}
            >
              {isConfirming ? 'Unsubscribing…' : 'Unsubscribe'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
