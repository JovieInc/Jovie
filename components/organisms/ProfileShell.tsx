'use client';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { useFeatureGate } from '@statsig/react-bindings';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useState } from 'react';
import { BackgroundPattern } from '@/components/atoms/BackgroundPattern';
import { ArtistInfo } from '@/components/molecules/ArtistInfo';
import { SocialLink as SocialLinkComponent } from '@/components/molecules/SocialLink';
import { ArtistContactsButton } from '@/components/profile/ArtistContactsButton';
import { ProfileFooter } from '@/components/profile/ProfileFooter';
import { Container } from '@/components/site/Container';
import { ThemeToggle } from '@/components/site/ThemeToggle';
import { CTAButton } from '@/components/ui/CTAButton';
import { track } from '@/lib/analytics';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';
import type { PublicContact } from '@/types/contacts';
import { Artist, LegacySocialLink } from '@/types/db';
import type {
  NotificationChannel,
  NotificationContactValues,
  NotificationSubscriptionState,
} from '@/types/notifications';

type ProfileNotificationsState = 'idle' | 'editing' | 'success';

interface ProfileNotificationsContextValue {
  state: ProfileNotificationsState;
  setState: React.Dispatch<React.SetStateAction<ProfileNotificationsState>>;
  notificationsEnabled: boolean;
  channel: NotificationChannel;
  setChannel: React.Dispatch<React.SetStateAction<NotificationChannel>>;
  subscribedChannels: NotificationSubscriptionState;
  setSubscribedChannels: React.Dispatch<
    React.SetStateAction<NotificationSubscriptionState>
  >;
  subscriptionDetails: NotificationContactValues;
  setSubscriptionDetails: React.Dispatch<
    React.SetStateAction<NotificationContactValues>
  >;
  openSubscription: (channel?: NotificationChannel) => void;
}

const ProfileNotificationsContext =
  React.createContext<ProfileNotificationsContextValue | null>(null);

const SOCIAL_NETWORK_PLATFORMS = [
  'twitter',
  'instagram',
  'tiktok',
  'youtube',
  'facebook',
  'linkedin',
  'discord',
  'twitch',
] as const;

export function useProfileNotifications(): ProfileNotificationsContextValue {
  const value = React.useContext(ProfileNotificationsContext);
  if (!value) {
    throw new Error('useProfileNotifications must be used within ProfileShell');
  }
  return value;
}

type ProfileShellProps = {
  artist: Artist;
  socialLinks: LegacySocialLink[];
  contacts?: PublicContact[];
  subtitle?: string;
  children?: React.ReactNode;
  showSocialBar?: boolean;
  showTipButton?: boolean;
  showBackButton?: boolean;
  showFooter?: boolean;
  showNotificationButton?: boolean;
  maxWidthClass?: string;
  backgroundPattern?: 'grid' | 'dots' | 'gradient' | 'none';
  showGradientBlurs?: boolean;
};

export function ProfileShell({
  artist,
  socialLinks,
  contacts = [],
  subtitle,
  children,
  showSocialBar = true,
  showTipButton = false,
  showBackButton = false,
  showFooter = true,
  showNotificationButton = false,
  maxWidthClass = 'w-full max-w-md',
  backgroundPattern = 'grid',
  showGradientBlurs = true,
}: ProfileShellProps) {
  const router = useRouter();
  const [isTipNavigating, setIsTipNavigating] = useState(false);
  const [isBackNavigating, setIsBackNavigating] = useState(false);
  const { success: showSuccess, error: showError } = useNotifications();
  const searchParams = useSearchParams();
  const notificationsGate = useFeatureGate(STATSIG_FLAGS.NOTIFICATIONS);
  const forceNotifications = searchParams?.get('preview') === '1';
  const notificationsEnabled = notificationsGate.value || forceNotifications;
  const [notificationsState, setNotificationsState] =
    useState<ProfileNotificationsState>('idle');
  const [channel, setChannel] = useState<NotificationChannel>('phone');
  const [subscribedChannels, setSubscribedChannels] =
    useState<NotificationSubscriptionState>({});
  const [subscriptionDetails, setSubscriptionDetails] =
    useState<NotificationContactValues>({});
  const [isNotificationMenuOpen, setIsNotificationMenuOpen] = useState(false);
  const [channelBusy, setChannelBusy] = useState<
    Partial<Record<NotificationChannel, boolean>>
  >({});

  const hasActiveSubscriptions = Boolean(
    subscribedChannels.email || subscribedChannels.phone
  );
  const isSubscribed =
    notificationsState === 'success' && hasActiveSubscriptions;

  const openSubscription = (nextChannel?: NotificationChannel) => {
    if (nextChannel) {
      setChannel(nextChannel);
    }

    setNotificationsState('editing');
    setIsNotificationMenuOpen(false);

    track('notifications_inline_cta_open', {
      handle: artist.handle,
      source: 'profile_inline',
      channel: nextChannel ?? channel,
    });
  };

  const notificationsContextValue: ProfileNotificationsContextValue = {
    state: notificationsState,
    setState: setNotificationsState,
    notificationsEnabled,
    channel,
    setChannel,
    subscribedChannels,
    setSubscribedChannels,
    subscriptionDetails,
    setSubscriptionDetails,
    openSubscription,
  };
  const socialNetworkLinks = socialLinks.filter(link =>
    SOCIAL_NETWORK_PLATFORMS.includes(
      link.platform.toLowerCase() as (typeof SOCIAL_NETWORK_PLATFORMS)[number]
    )
  );
  const hasSocialLinks = socialNetworkLinks.length > 0;
  const hasContacts = contacts.length > 0;

  const handleNotificationsClick = () => {
    if (!notificationsEnabled) return;

    if (hasActiveSubscriptions) {
      setIsNotificationMenuOpen(true);
      return;
    }

    openSubscription(channel);
  };

  const handleMenuOpenChange = (open: boolean) => {
    setIsNotificationMenuOpen(open);

    if (open) {
      const activeChannels = Object.entries(subscribedChannels)
        .filter(([, value]) => Boolean(value))
        .map(([key]) => key)
        .join(',');

      track('notifications_menu_open', {
        handle: artist.handle,
        active_channels: activeChannels,
      });
    }
  };

  const handleUnsubscribe = async (targetChannel: NotificationChannel) => {
    if (channelBusy[targetChannel]) return;

    const contactValue = subscriptionDetails[targetChannel];

    if (!contactValue) {
      showError('Need your contact to unsubscribe. Add it again to manage.');
      return;
    }

    setChannelBusy(prev => ({ ...prev, [targetChannel]: true }));

    try {
      track('notifications_unsubscribe_attempt', {
        channel: targetChannel,
        handle: artist.handle,
        source: 'profile_inline',
      });

      const response = await fetch('/api/notifications/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          artist_id: artist.id,
          channel: targetChannel,
          email: targetChannel === 'email' ? contactValue : undefined,
          phone: targetChannel === 'phone' ? contactValue : undefined,
          method: 'dropdown',
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to unsubscribe');
      }

      track('notifications_unsubscribe_success', {
        channel: targetChannel,
        handle: artist.handle,
        source: 'profile_inline',
      });

      setSubscribedChannels(prev => {
        const next = { ...prev, [targetChannel]: false };
        const stillSubscribed = Object.values(next).some(Boolean);

        if (!stillSubscribed) {
          setNotificationsState('editing');
        }

        return next;
      });

      setSubscriptionDetails(prev => {
        const next = { ...prev };
        delete next[targetChannel];
        return next;
      });

      setIsNotificationMenuOpen(false);

      showSuccess(
        targetChannel === 'phone'
          ? 'Unsubscribed from SMS updates.'
          : 'Unsubscribed from email updates.'
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to unsubscribe.';

      showError(message);

      track('notifications_unsubscribe_error', {
        channel: targetChannel,
        handle: artist.handle,
        error_message: message,
        source: 'profile_inline',
      });
    } finally {
      setChannelBusy(prev => ({ ...prev, [targetChannel]: false }));
    }
  };

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
          className='flex items-start gap-2'
          disabled={isLoading}
          onSelect={event => {
            event.preventDefault();
            void handleUnsubscribe(targetChannel);
          }}
        >
          <div className='flex-1'>
            <p className='text-sm font-semibold'>
              {label}{' '}
              <span className='text-xs font-normal text-gray-500'>
                (tap to unsubscribe)
              </span>
            </p>
            {contactValue ? (
              <p className='text-xs text-gray-500 break-all'>{contactValue}</p>
            ) : null}
          </div>
          <span
            aria-hidden
            className='text-green-500 dark:text-green-400 font-semibold'
          >
            ✓
          </span>
        </DropdownMenuItem>
      );
    }

    return (
      <DropdownMenuItem
        key={targetChannel}
        className='flex items-start gap-2'
        disabled={isLoading}
        onSelect={event => {
          event.preventDefault();
          openSubscription(targetChannel);
        }}
      >
        <div className='flex-1'>
          <p className='text-sm font-semibold'>Add {label}</p>
          <p className='text-xs text-gray-500'>
            Stay in the loop via {label.toLowerCase()}.
          </p>
        </div>
        <span aria-hidden className='text-xs text-gray-500'>
          +
        </span>
      </DropdownMenuItem>
    );
  };

  return (
    <ProfileNotificationsContext.Provider value={notificationsContextValue}>
      <div
        className='min-h-screen bg-white dark:bg-black transition-colors duration-200 relative overflow-hidden'
        data-test='public-profile-root'
      >
        {/* Background Effects */}
        {backgroundPattern !== 'none' && (
          <BackgroundPattern variant={backgroundPattern} />
        )}

        {/* Gradient Blurs */}
        {showGradientBlurs && (
          <>
            <div className='absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-blue-400/10 to-purple-400/10 dark:from-blue-400/20 dark:to-purple-400/20 rounded-full blur-3xl opacity-50' />
            <div className='absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-r from-purple-400/10 to-cyan-400/10 dark:from-purple-400/20 dark:to-cyan-400/20 rounded-full blur-3xl opacity-50' />
          </>
        )}

        <Container>
          {/* Back Button - Top left */}
          {showBackButton && (
            <div className='absolute top-4 left-4 z-10'>
              <Button
                className='rounded-full'
                variant='frosted'
                aria-label='Back to profile'
                onClick={() => {
                  if (isBackNavigating) return;
                  setIsBackNavigating(true);
                  router.push(`/${artist.handle}`);
                }}
                disabled={isBackNavigating}
              >
                {isBackNavigating ? (
                  <div className='w-5 h-5 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin' />
                ) : (
                  <svg
                    className='w-5 h-5 text-gray-700 dark:text-gray-300'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M10 19l-7-7m0 0l7-7m-7 7h18'
                    />
                  </svg>
                )}
              </Button>
            </div>
          )}

          {/* Top right controls */}
          <div className='absolute top-4 right-4 z-10 flex items-center gap-3'>
            <ThemeToggle appearance='icon' />
            {showNotificationButton && notificationsEnabled ? (
              hasActiveSubscriptions ? (
                <DropdownMenu
                  open={isNotificationMenuOpen}
                  onOpenChange={handleMenuOpenChange}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      className='rounded-full relative'
                      variant='frosted'
                      aria-label='Manage notification channels'
                      aria-pressed={isNotificationMenuOpen || isSubscribed}
                    >
                      <svg
                        className='w-5 h-5 text-gray-700 dark:text-gray-300'
                        fill={isSubscribed ? 'currentColor' : 'none'}
                        stroke='currentColor'
                        viewBox='0 0 24 24'
                      >
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth={2}
                          d='M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9'
                        />
                      </svg>
                      <span className='absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[10px] font-bold text-white shadow-sm shadow-black/20 dark:shadow-white/10'>
                        ✓
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align='end'
                    sideOffset={8}
                    className='w-72'
                  >
                    <DropdownMenuLabel className='text-xs uppercase tracking-wide text-gray-500'>
                      Notifications
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {renderChannelMenuItem('phone', 'SMS')}
                    {renderChannelMenuItem('email', 'Email')}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled
                      className='flex items-start gap-2 opacity-70 cursor-default'
                    >
                      <div className='flex-1'>
                        <p className='text-sm font-semibold'>Instagram DMs</p>
                        <p className='text-xs text-gray-500'>Coming soon</p>
                      </div>
                      <span aria-hidden className='text-xs text-gray-500'>
                        …
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  className='rounded-full relative'
                  variant='frosted'
                  aria-label='Subscribe to notifications'
                  aria-pressed={notificationsState === 'editing'}
                  onClick={handleNotificationsClick}
                >
                  <svg
                    className='w-5 h-5 text-gray-700 dark:text-gray-300'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9'
                    />
                  </svg>
                </Button>
              )
            ) : null}
          </div>

          <div className='flex min-h-screen flex-col py-12 relative z-10'>
            <div className='flex-1 flex flex-col items-center justify-start px-4'>
              <div className={`${maxWidthClass} space-y-8`}>
                <ArtistInfo artist={artist} subtitle={subtitle} />
                {children}
                {(showSocialBar || showTipButton) && (
                  <div className='flex justify-between items-center'>
                    {/* Social Icons - Left side */}
                    <div className='flex-1 flex justify-start'>
                      {showSocialBar && (
                        <div className='flex items-center gap-3'>
                          {hasSocialLinks
                            ? socialNetworkLinks.map(link => (
                                <SocialLinkComponent
                                  key={link.id}
                                  link={link}
                                  handle={artist.handle}
                                  artistName={artist.name}
                                />
                              ))
                            : !hasContacts && (
                                <div className='flex items-center space-x-2 px-3 py-2 rounded-lg bg-white/5 dark:bg-white/10 border border-dashed border-gray-300/50 dark:border-gray-600/50'>
                                  <svg
                                    className='w-4 h-4 text-gray-400 dark:text-gray-500'
                                    fill='none'
                                    stroke='currentColor'
                                    viewBox='0 0 24 24'
                                  >
                                    <path
                                      strokeLinecap='round'
                                      strokeLinejoin='round'
                                      strokeWidth={2}
                                      d='M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1'
                                    />
                                  </svg>
                                  <span className='text-xs text-gray-500 dark:text-gray-400'>
                                    Links coming soon
                                  </span>
                                </div>
                              )}
                          <ArtistContactsButton
                            contacts={contacts}
                            artistHandle={artist.handle}
                            artistName={artist.name}
                          />
                        </div>
                      )}
                    </div>

                    {/* Tip Button - Right side */}
                    {showTipButton && (
                      <div className='flex-shrink-0'>
                        <CTAButton
                          href={`/${artist.handle}?mode=tip`}
                          variant='ghost'
                          size='sm'
                          className='px-3 py-1.5 text-xs rounded-full bg-white/10 hover:bg-white/20 dark:bg-white/5 dark:hover:bg-white/10 border border-gray-200/30 dark:border-white/10 backdrop-blur-sm'
                          isLoading={isTipNavigating}
                          onClick={() => setIsTipNavigating(true)}
                        >
                          Tip
                        </CTAButton>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {showFooter && <ProfileFooter artist={artist} />}
          </div>
        </Container>
      </div>
    </ProfileNotificationsContext.Provider>
  );
}
