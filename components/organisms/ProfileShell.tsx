'use client';
import { useFeatureGate } from '@statsig/react-bindings';
import { usePathname, useSearchParams } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { BackgroundPattern } from '@/components/atoms/BackgroundPattern';
import { ProfileNavButton } from '@/components/atoms/ProfileNavButton';
import { ArtistInfo } from '@/components/molecules/ArtistInfo';
import { SocialLink as SocialLinkComponent } from '@/components/molecules/SocialLink';
import {
  type ProfileNotificationsHydrationStatus,
  type ProfileNotificationsState,
  useProfileNotificationsController,
} from '@/components/organisms/hooks/useProfileNotificationsController';
import {
  usePopstateReset,
  useProfileVisitTracking,
  useTipPageTracking,
} from '@/components/organisms/hooks/useProfileTracking';
import { ProfileNotificationsButton } from '@/components/organisms/ProfileNotificationsButton';
import { ProfileNotificationsMenu } from '@/components/organisms/ProfileNotificationsMenu';
import { ArtistContactsButton } from '@/components/profile/ArtistContactsButton';
import { ProfileFooter } from '@/components/profile/ProfileFooter';
import { Container } from '@/components/site/Container';
import { CTAButton } from '@/components/ui/CTAButton';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';
import type { PublicContact } from '@/types/contacts';
import { Artist, LegacySocialLink } from '@/types/db';
import type {
  NotificationChannel,
  NotificationContactValues,
  NotificationSubscriptionState,
} from '@/types/notifications';

interface ProfileNotificationsContextValue {
  state: ProfileNotificationsState;
  setState: React.Dispatch<React.SetStateAction<ProfileNotificationsState>>;
  hydrationStatus: ProfileNotificationsHydrationStatus;
  hasStoredContacts: boolean;
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
  forceNotificationsEnabled?: boolean;
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
  forceNotificationsEnabled = false,
  maxWidthClass = 'w-full max-w-md',
  backgroundPattern = 'grid',
  showGradientBlurs = true,
}: ProfileShellProps) {
  const [isTipNavigating, setIsTipNavigating] = useState(false);
  const { success: showSuccess, error: showError } = useNotifications();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const notificationsGate = useFeatureGate(STATSIG_FLAGS.NOTIFICATIONS);
  const mode = searchParams?.get('mode') ?? 'profile';
  const forceNotifications = searchParams?.get('preview') === '1';
  const notificationsEnabled =
    forceNotificationsEnabled || notificationsGate.value || forceNotifications;
  const source = searchParams?.get('source');

  useTipPageTracking({
    artistHandle: artist.handle,
    mode,
    source,
  });
  useProfileVisitTracking(artist.id);
  usePopstateReset(() => setIsTipNavigating(false));

  // Reset tip loading on navigation/back
  useEffect(() => {
    setIsTipNavigating(false);
  }, [pathname, mode]);

  const notificationsController = useProfileNotificationsController({
    artistHandle: artist.handle,
    artistId: artist.id,
    notificationsEnabled,
    onError: showError,
    onSuccess: showSuccess,
  });

  const {
    channel,
    channelBusy,
    handleMenuOpenChange,
    handleNotificationsClick,
    handleUnsubscribe,
    hasStoredContacts,
    hasActiveSubscriptions,
    hydrationStatus,
    isNotificationMenuOpen,
    menuTriggerRef,
    openSubscription,
    setChannel,
    setState: setNotificationsState,
    setSubscribedChannels,
    setSubscriptionDetails,
    state: notificationsState,
    subscribedChannels,
    subscriptionDetails,
  } = notificationsController;

  const notificationsContextValue = useMemo(
    () => ({
      state: notificationsState,
      setState: setNotificationsState,
      hydrationStatus,
      hasStoredContacts,
      notificationsEnabled,
      channel,
      setChannel,
      subscribedChannels,
      setSubscribedChannels,
      subscriptionDetails,
      setSubscriptionDetails,
      openSubscription,
    }),
    [
      channel,
      hasStoredContacts,
      hydrationStatus,
      notificationsEnabled,
      notificationsState,
      openSubscription,
      setChannel,
      setNotificationsState,
      setSubscribedChannels,
      setSubscriptionDetails,
      subscribedChannels,
      subscriptionDetails,
    ]
  );
  const socialNetworkLinks = socialLinks.filter(
    link =>
      link.is_visible !== false &&
      SOCIAL_NETWORK_PLATFORMS.includes(
        link.platform.toLowerCase() as (typeof SOCIAL_NETWORK_PLATFORMS)[number]
      )
  );
  const hasSocialLinks = socialNetworkLinks.length > 0;
  const hasContacts = contacts.length > 0;

  return (
    <ProfileNotificationsContext.Provider value={notificationsContextValue}>
      <div
        className='relative min-h-screen overflow-hidden bg-base text-primary-token transition-colors duration-200 font-medium tracking-tight'
        data-test='public-profile-root'
      >
        {backgroundPattern !== 'none' && (
          <BackgroundPattern variant={backgroundPattern} />
        )}

        {showGradientBlurs && (
          <>
            <div className='absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-linear-to-r from-primary/10 to-secondary/10 blur-3xl opacity-50' />
            <div className='absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-linear-to-r from-secondary/10 to-accent/10 blur-3xl opacity-50' />
          </>
        )}

        <Container>
          <div className='absolute left-4 top-4 z-10'>
            <ProfileNavButton
              showBackButton={showBackButton}
              artistHandle={artist.handle}
              hideBranding={Boolean(artist.settings?.hide_branding)}
            />
          </div>

          <div className='absolute right-4 top-4 z-10 flex items-center gap-2'>
            {showNotificationButton && notificationsEnabled ? (
              hasActiveSubscriptions ? (
                <ProfileNotificationsMenu
                  channelBusy={channelBusy}
                  hasActiveSubscriptions={hasActiveSubscriptions}
                  notificationsState={notificationsState}
                  onAddChannel={openSubscription}
                  onOpenChange={handleMenuOpenChange}
                  onUnsubscribe={handleUnsubscribe}
                  open={isNotificationMenuOpen}
                  subscribedChannels={subscribedChannels}
                  subscriptionDetails={subscriptionDetails}
                  triggerRef={menuTriggerRef}
                />
              ) : (
                <ProfileNotificationsButton
                  buttonRef={menuTriggerRef}
                  hasActiveSubscriptions={false}
                  notificationsState={notificationsState}
                  onClick={handleNotificationsClick}
                />
              )
            ) : null}
          </div>

          <div className='relative z-10 flex min-h-screen flex-col py-6 sm:py-12'>
            <div className='flex flex-1 flex-col items-center justify-start px-4'>
              <div className={`${maxWidthClass} space-y-6 sm:space-y-8`}>
                <ArtistInfo artist={artist} subtitle={subtitle} />
                {children}
                {(showSocialBar || showTipButton) && (
                  <div className='flex items-center justify-between gap-4'>
                    <div className='flex flex-1 justify-start'>
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
                                <div className='flex items-center space-x-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-muted-foreground'>
                                  <svg
                                    className='h-4 w-4 text-muted-foreground'
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
                                  <span className='text-xs'>
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

                    {showTipButton && (
                      <div className='shrink-0'>
                        <CTAButton
                          href={`/${artist.handle}?mode=tip`}
                          variant='primary'
                          size='sm'
                          className='rounded-full px-3 py-1.5 text-xs shadow-sm'
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
