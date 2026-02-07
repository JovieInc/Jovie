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
} from '@jovie/ui';
import type { NotificationChannel } from '@/types/notifications';
import { formatE164PhoneForDisplay } from '../hooks/useProfileNotificationsController';
import { ProfileNotificationsButton } from '../ProfileNotificationsButton';
import type { ProfileNotificationsMenuProps } from './types';
import { useNotificationConfirm } from './useNotificationConfirm';
import { labelForChannel } from './utils';

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
  const {
    confirmChannel,
    isConfirming,
    openConfirmDialog,
    closeConfirmDialog,
    handleConfirm,
  } = useNotificationConfirm();

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
          <DropdownMenuLabel className='text-sm font-semibold text-primary-token'>
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
              <p className='text-sm font-semibold text-primary-token'>
                Instagram DMs
              </p>
              <p className='text-xs text-tertiary-token'>Coming soon</p>
            </div>
            <span aria-hidden className='text-xs text-tertiary-token'>
              …
            </span>
          </DropdownMenuItem>
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
