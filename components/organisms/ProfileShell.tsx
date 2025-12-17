'use client';

import { useFeatureGate } from '@statsig/react-bindings';
import { usePathname, useSearchParams } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { BackgroundPattern } from '@/components/atoms/BackgroundPattern';
import { ProfileNavButton } from '@/components/atoms/ProfileNavButton';
import { ArtistInfo } from '@/components/molecules/ArtistInfo';
import { SocialLink as SocialLinkComponent } from '@/components/molecules/SocialLink';
import { ArtistContactsButton } from '@/components/profile/ArtistContactsButton';
import { ProfileFooter } from '@/components/profile/ProfileFooter';
import { ProfileNotificationsButton } from '@/components/profile/ProfileNotificationsButton';
import { ProfileNotificationsMenu } from '@/components/profile/ProfileNotificationsMenu';
import { type ProfileNotificationsContextValue } from '@/components/profile/profile-notifications.types';
import { useProfileNotificationsController } from '@/components/profile/useProfileNotificationsController';
import { Container } from '@/components/site/Container';
import { CTAButton } from '@/components/ui/CTAButton';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';
import type { PublicContact } from '@/types/contacts';
import { Artist, LegacySocialLink } from '@/types/db';

function useProfileTracking({
  artistHandle,
  artistId,
  mode,
  searchParams,
}: {
  artistHandle?: string;
  artistId?: string;
  mode: string;
  searchParams: ReturnType<typeof useSearchParams>;
}) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!artistHandle) return;
    if (mode !== 'tip') return;

    const source = searchParams?.get('source');

    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: artistHandle,
        linkType: 'tip',
        target: 'tip_page',
        source,
      }),
      keepalive: true,
    }).catch(() => {
      // Ignore tracking errors
    });
  }, [artistHandle, mode, searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!artistId) return;

    fetch('/api/audience/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: artistId }),
      keepalive: true,
    }).catch(() => {
      // Ignore tracking errors
    });
  }, [artistId]);
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
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const notificationsGate = useFeatureGate(STATSIG_FLAGS.NOTIFICATIONS);
  const { success: showSuccess, error: showError } = useNotifications();
  const forceNotifications = searchParams?.get('preview') === '1';
  const notificationsEnabled =
    forceNotificationsEnabled || notificationsGate.value || forceNotifications;
  const mode = searchParams?.get('mode') ?? 'profile';

  useProfileTracking({
    artistHandle: artist.handle,
    artistId: artist.id,
    mode,
    searchParams,
  });

  useEffect(() => {
    setIsTipNavigating(false);
  }, [pathname, mode]);

  useEffect(() => {
    const handlePopState = () => setIsTipNavigating(false);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const {
    channelBusy,
    contextValue,
    handleMenuOpenChange,
    handleNotificationsClick,
    handleUnsubscribe,
    hasActiveSubscriptions,
    isNotificationMenuOpen,
    isSubscribed,
    subscribedChannels,
    subscriptionDetails,
  } = useProfileNotificationsController({
    artistHandle: artist.handle,
    artistId: artist.id,
    notificationsEnabled,
    onError: showError,
    onSuccess: showSuccess,
  });

  const socialNetworkLinks = useMemo(
    () =>
      socialLinks.filter(
        link =>
          link.is_visible !== false &&
          SOCIAL_NETWORK_PLATFORMS.includes(
            link.platform.toLowerCase() as (typeof SOCIAL_NETWORK_PLATFORMS)[number]
          )
      ),
    [socialLinks]
  );

  const hasSocialLinks = socialNetworkLinks.length > 0;
  const hasContacts = contacts.length > 0;

  return (
    <ProfileNotificationsContext.Provider value={contextValue}>
      <div
        className='relative min-h-screen overflow-hidden bg-background text-foreground transition-colors duration-200'
        data-test='public-profile-root'
      >
        {backgroundPattern !== 'none' && (
          <BackgroundPattern variant={backgroundPattern} />
        )}

        {showGradientBlurs && (
          <>
            <div className='absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-gradient-to-r from-[color:var(--accent-conv)]/15 to-[color:var(--accent-analytics)]/15 blur-3xl opacity-50' />
            <div className='absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-gradient-to-r from-[color:var(--accent-beauty)]/14 to-[color:var(--accent-pro)]/16 blur-3xl opacity-50' />
          </>
        )}

        <Container>
          <div className='absolute left-4 top-4 z-10'>
            <ProfileNavButton
              showBackButton={showBackButton}
              artistHandle={artist.handle}
            />
          </div>

          <div className='absolute right-4 top-4 z-10 flex items-center gap-3'>
            {showNotificationButton && notificationsEnabled ? (
              hasActiveSubscriptions ? (
                <ProfileNotificationsMenu
                  channelBusy={channelBusy}
                  isOpen={isNotificationMenuOpen}
                  isSubscribed={isSubscribed}
                  onAddChannel={contextValue.openSubscription}
                  onOpenChange={handleMenuOpenChange}
                  onUnsubscribe={handleUnsubscribe}
                  subscribedChannels={subscribedChannels}
                  subscriptionDetails={subscriptionDetails}
                />
              ) : (
                <ProfileNotificationsButton
                  aria-label='Subscribe to notifications'
                  isOpen={contextValue.state === 'editing'}
                  onClick={handleNotificationsClick}
                />
              )
            ) : null}
          </div>

          <div className='relative z-10 flex min-h-screen flex-col py-12'>
            <div className='flex flex-1 flex-col items-center justify-start px-4'>
              <div className={`${maxWidthClass} space-y-8`}>
                <ArtistInfo artist={artist} subtitle={subtitle} />
                {children}
                {(showSocialBar || showTipButton) && (
                  <div className='flex items-center justify-between'>
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
                                <div className='flex items-center space-x-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-muted-foreground'>
                                  <svg
                                    className='h-4 w-4'
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
                          className='rounded-full border border-border bg-foreground px-3 py-1.5 text-xs text-background shadow-sm transition hover:bg-foreground/90'
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
