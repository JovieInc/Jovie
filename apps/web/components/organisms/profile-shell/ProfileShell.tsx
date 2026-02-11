'use client';

import { DollarSign } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BackgroundPattern } from '@/components/atoms/BackgroundPattern';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { ArtistInfo } from '@/components/molecules/ArtistInfo';
import { ProfileNavButton } from '@/components/molecules/ProfileNavButton';
import { SocialLink as SocialLinkComponent } from '@/components/molecules/SocialLink';
import { ProfileNotificationsButton } from '@/components/organisms/ProfileNotificationsButton';
import { ProfileNotificationsMenu } from '@/components/organisms/profile-notifications-menu';
import { ArtistContactsButton } from '@/components/profile/artist-contacts-button';
import { ProfileFooter } from '@/components/profile/ProfileFooter';
import { TipDrawer } from '@/components/profile/TipDrawer';
import { Container } from '@/components/site/Container';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { ProfileNotificationsContext } from './ProfileNotificationsContext';
import type { ProfileShellProps } from './types';
import { useProfileShell } from './useProfileShell';

const ALLOWED_VENMO_HOSTS = new Set(['venmo.com', 'www.venmo.com']);

function extractVenmoUsername(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (ALLOWED_VENMO_HOSTS.has(u.hostname)) {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === 'u' && parts[1]) return parts[1];
      if (parts[0]) return parts[0];
    }
    return null;
  } catch {
    return null;
  }
}

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
  const {
    notificationsEnabled,
    notificationsController,
    notificationsContextValue,
    socialNetworkLinks,
    hasSocialLinks,
  } = useProfileShell({
    artist,
    socialLinks,
    contacts,
  });

  const isMobile = useBreakpointDown('md');
  const [tipDrawerOpen, setTipDrawerOpen] = useState(false);

  // Extract venmo link from social links for the tip drawer
  const venmoLink = useMemo(
    () => socialLinks.find(l => l.platform === 'venmo')?.url ?? null,
    [socialLinks]
  );
  const venmoUsername = useMemo(
    () => extractVenmoUsername(venmoLink),
    [venmoLink]
  );
  const hasTipSupport = showTipButton && Boolean(venmoLink);

  const {
    channelBusy,
    handleMenuOpenChange,
    handleNotificationsClick,
    handleUnsubscribe,
    hasActiveSubscriptions,
    isNotificationMenuOpen,
    menuTriggerRef,
    openSubscription,
    state: notificationsState,
    subscribedChannels,
    subscriptionDetails,
  } = notificationsController;

  // Render notification button/menu based on state
  const renderNotificationControls = () => {
    if (!showNotificationButton || !notificationsEnabled) {
      return null;
    }

    if (hasActiveSubscriptions) {
      return (
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
      );
    }

    return (
      <ProfileNotificationsButton
        buttonRef={menuTriggerRef}
        hasActiveSubscriptions={false}
        notificationsState={notificationsState}
        onClick={handleNotificationsClick}
      />
    );
  };

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
            <div className='absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-surface-2 blur-3xl opacity-20' />
            <div className='absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-surface-3 blur-3xl opacity-15' />
          </>
        )}

        <Container>
          <div className='absolute left-4 top-4 z-20'>
            <ProfileNavButton
              showBackButton={showBackButton}
              artistHandle={artist.handle}
              hideBranding={Boolean(artist.settings?.hide_branding)}
            />
          </div>

          <div className='absolute right-4 top-4 z-20 flex items-center gap-2'>
            {renderNotificationControls()}
          </div>

          <div className='relative z-10 flex min-h-screen flex-col py-12'>
            <div className='flex flex-1 flex-col items-center justify-start px-4'>
              <div className={`${maxWidthClass} space-y-6 md:space-y-8`}>
                <ArtistInfo artist={artist} subtitle={subtitle} />
                {children}
                {/* Social bar with contacts and tip buttons inline */}
                {(showSocialBar || hasTipSupport || hasActiveSubscriptions) && (
                  <div className='flex justify-center'>
                    <div
                      className='flex flex-wrap items-center justify-center gap-3'
                      data-testid='social-links'
                    >
                      {(showSocialBar || hasActiveSubscriptions) &&
                        hasSocialLinks &&
                        socialNetworkLinks.map(link => (
                          <SocialLinkComponent
                            key={link.id}
                            link={link}
                            handle={artist.handle}
                            artistName={artist.name}
                          />
                        ))}
                      <ArtistContactsButton
                        contacts={contacts}
                        artistHandle={artist.handle}
                        artistName={artist.name}
                      />
                      {hasTipSupport &&
                        (isMobile ? (
                          <>
                            <CircleIconButton
                              size='xs'
                              variant='surface'
                              ariaLabel='Tip'
                              data-testid='tip-trigger'
                              className='hover:scale-105'
                              onClick={() => setTipDrawerOpen(true)}
                            >
                              <DollarSign
                                className='h-4 w-4'
                                aria-hidden='true'
                              />
                            </CircleIconButton>
                            <TipDrawer
                              open={tipDrawerOpen}
                              onOpenChange={setTipDrawerOpen}
                              artistName={artist.name}
                              artistHandle={artist.handle}
                              venmoLink={venmoLink!}
                              venmoUsername={venmoUsername}
                            />
                          </>
                        ) : (
                          <CircleIconButton
                            size='xs'
                            variant='surface'
                            ariaLabel='Tip'
                            data-testid='tip-trigger'
                            className='hover:scale-105'
                            asChild
                          >
                            <Link href={`/${artist.handle}?mode=tip`}>
                              <DollarSign
                                className='h-4 w-4'
                                aria-hidden='true'
                              />
                            </Link>
                          </CircleIconButton>
                        ))}
                    </div>
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
