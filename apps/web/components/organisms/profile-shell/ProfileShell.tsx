'use client';

import {
  Calendar,
  DollarSign,
  Mail,
  ShoppingBag,
  UserRound,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { BackgroundPattern } from '@/components/atoms/BackgroundPattern';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { ArtistInfo } from '@/components/molecules/ArtistInfo';
import { ProfileNavButton } from '@/components/molecules/ProfileNavButton';
import { SocialLink as SocialLinkComponent } from '@/components/molecules/SocialLink';
import { ProfileNotificationsButton } from '@/components/organisms/ProfileNotificationsButton';
import { Container } from '@/components/site/Container';
import { ProfileFooter } from '@/features/profile/ProfileFooter';
import { extractVenmoUsername } from '@/features/profile/utils/venmo';

const TipDrawer = dynamic(
  () =>
    import('@/features/profile/TipDrawer').then(mod => ({
      default: mod.TipDrawer,
    })),
  { ssr: false, loading: () => null }
);

const ProfileNotificationsMenu = dynamic(
  () =>
    import('@/components/organisms/profile-notifications-menu').then(mod => ({
      default: mod.ProfileNotificationsMenu,
    })),
  {
    ssr: false,
    loading: () => (
      <ProfileNotificationsButton
        hasActiveSubscriptions
        notificationsState='idle'
        onClick={() => {}}
      />
    ),
  }
);

import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { getCanonicalProfileDSPs, toDSPPreferences } from '@/lib/profile-dsps';
import { ProfileNotificationsContext } from './ProfileNotificationsContext';
import type { ProfileShellProps } from './types';
import { useProfileShell } from './useProfileShell';

export function ProfileShell({
  artist,
  socialLinks,
  viewerCountryCode,
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
    socialLinks: prioritizedSocialLinks,
  } = useProfileShell({
    artist,
    socialLinks,
    viewerCountryCode,
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
  const headerSocialLinks = useMemo(
    () => prioritizedSocialLinks.slice(0, 2),
    [prioritizedSocialLinks]
  );
  const hasContacts = contacts.length > 0;
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
                className={`${maxWidthClass} flex min-h-full flex-1 flex-col`}
              >
                <div className='space-y-4 sm:space-y-5 md:space-y-6'>
                  <div className='md:grid md:grid-cols-[1fr_auto_1fr] md:items-center'>
                    <div className='hidden md:block' />
                    <ArtistInfo
                      artist={artist}
                      subtitle={subtitle}
                      photoDownloadSizes={photoDownloadSizes}
                      allowPhotoDownloads={allowPhotoDownloads}
                      className='hidden md:flex'
                    />
                    {headerSocialLinks.length > 0 ? (
                      <div className='hidden items-center justify-self-end gap-2 md:flex'>
                        {headerSocialLinks.map(link => (
                          <SocialLinkComponent
                            key={link.id}
                            link={link}
                            handle={artist.handle}
                            artistName={artist.name}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className='hidden md:block' />
                    )}
                  </div>
                  <ArtistInfo
                    artist={artist}
                    subtitle={subtitle}
                    photoDownloadSizes={photoDownloadSizes}
                    allowPhotoDownloads={allowPhotoDownloads}
                    className='md:hidden'
                  />
                  {children}
                </div>

                {(showSocialBar ||
                  showTourButton ||
                  hasTipSupport ||
                  hasContacts ||
                  showShopButton) && (
                  <div className='mt-auto flex justify-center pt-6 sm:pt-8'>
                    <div
                      className='flex min-h-12 flex-wrap items-center justify-center gap-2 rounded-full border border-subtle/50 bg-black/10 px-2 py-2 backdrop-blur-sm sm:gap-3'
                      data-testid='profile-mode-nav'
                    >
                      <CircleIconButton
                        size='md'
                        variant='ghost'
                        ariaLabel='Profile'
                        data-testid='profile-trigger'
                        className={`border transition-[background-color,border-color,color] ${
                          !mode || mode === 'profile'
                            ? 'border-subtle bg-surface-1 text-primary-token'
                            : 'border-subtle/50 bg-transparent text-secondary-token hover:border-subtle hover:bg-surface-1 hover:text-primary-token'
                        }`}
                        onClick={() => {
                          router.push(`/${artist.handle}`);
                        }}
                      >
                        <UserRound className='h-4 w-4' aria-hidden='true' />
                      </CircleIconButton>
                      {hasContacts && (
                        <CircleIconButton
                          size='md'
                          variant='ghost'
                          ariaLabel='Contact'
                          data-testid='contact-trigger'
                          className={`border transition-[background-color,border-color,color] ${
                            mode === 'contact'
                              ? 'border-subtle bg-surface-1 text-primary-token'
                              : 'border-subtle/50 bg-transparent text-secondary-token hover:border-subtle hover:bg-surface-1 hover:text-primary-token'
                          }`}
                          onClick={() => {
                            router.push(`/${artist.handle}?mode=contact`);
                          }}
                        >
                          <Mail className='h-4 w-4' aria-hidden='true' />
                        </CircleIconButton>
                      )}
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

                      {/* Tip */}
                      {hasTipSupport && venmoLink && (
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
                          onClick={() => {
                            if (isMobile) {
                              setTipDrawerOpen(true);
                              return;
                            }
                            router.push(`/${artist.handle}?mode=tip`);
                          }}
                        >
                          <DollarSign className='h-4 w-4' aria-hidden='true' />
                        </CircleIconButton>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {hasTipSupport && venmoLink && isMobile ? (
              <TipDrawer
                open={tipDrawerOpen}
                onOpenChange={setTipDrawerOpen}
                artistName={artist.name}
                artistHandle={artist.handle}
                venmoLink={venmoLink}
                venmoUsername={venmoUsername}
              />
            ) : null}

            {showFooter && <ProfileFooter artist={artist} />}
          </div>
        </Container>
      </div>
    </ProfileNotificationsContext.Provider>
  );
}
