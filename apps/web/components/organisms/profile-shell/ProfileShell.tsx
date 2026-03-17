'use client';

import { Calendar, DollarSign, ShoppingBag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
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
import { extractVenmoUsername } from '@/components/profile/utils/venmo';
import { Container } from '@/components/site/Container';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { getCanonicalProfileDSPs, toDSPPreferences } from '@/lib/profile-dsps';
import { ProfileNotificationsContext } from './ProfileNotificationsContext';
import type { ProfileShellProps } from './types';
import { useProfileShell } from './useProfileShell';

export function ProfileShell({
  artist,
  socialLinks,
  contacts = [],
  subtitle,
  children,
  showSocialBar = true,
  mode,
  showTipButton = false,
  isTipModeActive = false,
  showBackButton = false,
  showTourButton = false,
  isTourModeActive = false,
  showFooter = true,
  showNotificationButton = false,
  showShopButton = false,
  maxWidthClass = 'w-full max-w-md',
  backgroundPattern = 'grid',
  showGradientBlurs = true,
  photoDownloadSizes = [],
  allowPhotoDownloads = false,
  visitTrackingToken,
}: ProfileShellProps) {
  const {
    handleNotificationsTrigger,
    notificationsEnabled,
    notificationsController,
    notificationsContextValue,
    modeLinks,
    socialLinks: prioritizedSocialLinks,
  } = useProfileShell({
    artist,
    socialLinks,
    contacts,
    visitTrackingToken,
  });

  const isMobile = useBreakpointDown('md');
  const router = useRouter();
  const [tipDrawerOpen, setTipDrawerOpen] = useState(false);

  // Fire tip_page_view pixel event when tip mode is active on page load
  useEffect(() => {
    if (!isTipModeActive) return;
    // @ts-expect-error - joviePixel is set by JoviePixel component
    if (globalThis.joviePixel?.track) {
      // @ts-expect-error - joviePixel is set by JoviePixel component
      globalThis.joviePixel.track('tip_page_view');
    }
  }, [isTipModeActive]);

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
  const availableDspPreferences = useMemo(
    () => toDSPPreferences(getCanonicalProfileDSPs(artist, socialLinks)),
    [artist, socialLinks]
  );

  const {
    channelBusy,
    contentPreferences,
    handleMenuOpenChange,
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
          artistId={artist.id}
          availableDspPreferences={availableDspPreferences}
          channelBusy={channelBusy}
          contentPreferences={contentPreferences}
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
        onClick={handleNotificationsTrigger}
      />
    );
  };

  return (
    <ProfileNotificationsContext.Provider value={notificationsContextValue}>
      <div
        id='main-content'
        className='relative w-full min-h-dvh bg-base text-primary-token font-medium tracking-tight'
        data-test='public-profile-root'
      >
        {backgroundPattern !== 'none' && (
          <BackgroundPattern variant={backgroundPattern} />
        )}

        {showGradientBlurs && (
          <>
            <div className='absolute left-1/4 top-1/4 h-48 w-48 sm:h-72 sm:w-72 md:h-96 md:w-96 rounded-full bg-surface-2 blur-3xl opacity-20' />
            <div className='absolute bottom-1/4 right-1/4 h-48 w-48 sm:h-72 sm:w-72 md:h-96 md:w-96 rounded-full bg-surface-3 blur-3xl opacity-15' />
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

          <div className='relative z-10 flex min-h-dvh flex-col pt-14 pb-4 sm:pt-16 sm:pb-6'>
            <div className='flex flex-1 flex-col items-center px-4'>
              <div
                className={`${maxWidthClass} space-y-4 sm:space-y-5 md:space-y-6`}
              >
                <ArtistInfo
                  artist={artist}
                  subtitle={subtitle}
                  photoDownloadSizes={photoDownloadSizes}
                  allowPhotoDownloads={allowPhotoDownloads}
                />
                {children}
                {/* Social bar with contacts and tip buttons inline */}
                {(showSocialBar ||
                  showTourButton ||
                  hasTipSupport ||
                  hasActiveSubscriptions) && (
                  <div className='flex justify-center'>
                    <div
                      className='flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-1 py-1'
                      data-testid='social-links'
                    >
                      {/* Mail (contacts) — left */}
                      <ArtistContactsButton
                        contacts={contacts}
                        artistHandle={artist.handle}
                        artistName={artist.name}
                      />
                      {/* Social icons — only in profile mode to reduce distractions during conversion flows */}
                      {(!mode || mode === 'profile') &&
                        showSocialBar &&
                        modeLinks.map(link => (
                          <SocialLinkComponent
                            key={link.id}
                            link={link}
                            handle={artist.handle}
                            artistName={artist.name}
                          />
                        ))}
                      {/* Tour */}
                      {showTourButton && (
                        <CircleIconButton
                          size='md'
                          variant='ghost'
                          ariaLabel='Tour dates'
                          data-testid='tour-trigger'
                          className={`border transition-[background-color,border-color,color] ${
                            isTourModeActive
                              ? 'border-subtle bg-surface-1 text-primary-token'
                              : 'border-subtle/50 bg-transparent text-secondary-token hover:border-subtle hover:bg-surface-1 hover:text-primary-token'
                          }`}
                          onClick={() => {
                            router.push(`/${artist.handle}?mode=tour`);
                          }}
                        >
                          <Calendar className='h-4 w-4' aria-hidden='true' />
                        </CircleIconButton>
                      )}

                      {/* Shop */}
                      {showShopButton && (
                        <CircleIconButton
                          size='md'
                          variant='ghost'
                          ariaLabel='Shop'
                          data-testid='shop-trigger'
                          className='border border-subtle/50 bg-transparent text-secondary-token transition-[background-color,border-color,color] hover:border-subtle hover:bg-surface-1 hover:text-primary-token'
                          onClick={() => {
                            window.open(
                              `/${artist.handle}/shop`,
                              '_blank',
                              'noopener,noreferrer'
                            );
                          }}
                        >
                          <ShoppingBag className='h-4 w-4' aria-hidden='true' />
                        </CircleIconButton>
                      )}

                      {/* Tip — right */}
                      {hasTipSupport &&
                        venmoLink &&
                        (isMobile ? (
                          <>
                            <CircleIconButton
                              size='md'
                              variant='ghost'
                              ariaLabel='Tip'
                              data-testid='tip-trigger'
                              className={`border transition-[background-color,border-color,color] ${
                                isTipModeActive
                                  ? 'border-subtle bg-surface-1 text-primary-token'
                                  : 'border-subtle/50 bg-transparent text-secondary-token hover:border-subtle hover:bg-surface-1 hover:text-primary-token'
                              }`}
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
                              venmoLink={venmoLink}
                              venmoUsername={venmoUsername}
                            />
                          </>
                        ) : (
                          /* Always reserve space for the tip button to prevent layout shift.
                             When tip mode is active, render invisibly instead of not at all. */
                          <CircleIconButton
                            size='md'
                            variant='ghost'
                            ariaLabel='Tip'
                            data-testid='tip-trigger'
                            className={`border border-subtle/50 bg-transparent text-secondary-token transition-[background-color,border-color,color] hover:border-subtle hover:bg-surface-1 hover:text-primary-token${isTipModeActive ? ' invisible' : ''}`}
                            aria-hidden={isTipModeActive || undefined}
                            tabIndex={isTipModeActive ? -1 : undefined}
                            onClick={() => {
                              router.push(`/${artist.handle}?mode=tip`);
                            }}
                          >
                            <DollarSign
                              className='h-4 w-4'
                              aria-hidden='true'
                            />
                          </CircleIconButton>
                        ))}
                      {(!mode || mode === 'profile') &&
                        showSocialBar &&
                        prioritizedSocialLinks.map(link => (
                          <SocialLinkComponent
                            key={link.id}
                            link={link}
                            handle={artist.handle}
                            artistName={artist.name}
                          />
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
