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
  const isProfileRoot = !mode || mode === 'profile';
  const isCompactMobileHeader = !isProfileRoot || showBackButton;
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
    smsEnabled: false,
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
    smsEnabled,
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
          smsEnabled={smsEnabled}
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
        className='relative min-h-dvh w-full overflow-hidden bg-[color:var(--profile-stage-bg)] text-primary-token font-medium tracking-tight'
        data-test='public-profile-root'
      >
        <div
          className='pointer-events-none absolute inset-0 bg-[var(--profile-stage-overlay)]'
          aria-hidden='true'
        />

        {backgroundPattern !== 'none' && (
          <BackgroundPattern variant={backgroundPattern} />
        )}

        {showGradientBlurs && (
          <>
            <div className='pointer-events-none absolute left-[12%] top-[14%] h-56 w-56 rounded-full bg-[color:var(--profile-stage-glow-a)] blur-3xl sm:h-72 sm:w-72 md:h-[26rem] md:w-[26rem]' />
            <div className='pointer-events-none absolute bottom-[10%] right-[10%] h-56 w-56 rounded-full bg-[color:var(--profile-stage-glow-b)] blur-3xl sm:h-72 sm:w-72 md:h-[24rem] md:w-[24rem]' />
          </>
        )}

        <Container>
          <div className='absolute left-4 top-3.5 z-20 md:top-4'>
            <ProfileNavButton
              showBackButton={showBackButton}
              artistHandle={artist.handle}
            />
          </div>

          <div className='absolute right-4 top-3.5 z-20 flex items-center gap-2 md:top-4'>
            {renderNotificationControls()}
          </div>

          <div className='relative z-10 flex min-h-dvh flex-col pb-4 pt-12 sm:pb-6 sm:pt-14'>
            <div className='flex flex-1 flex-col items-center px-4'>
              <div
                className={`${maxWidthClass} flex min-h-full flex-1 flex-col`}
              >
                <div
                  className={`${
                    isCompactMobileHeader
                      ? 'space-y-3 sm:space-y-4 md:space-y-6'
                      : 'space-y-4 sm:space-y-5 md:space-y-6'
                  }`}
                >
                  <div className='hidden md:flex md:justify-center'>
                    <ArtistInfo
                      artist={artist}
                      subtitle={subtitle}
                      photoDownloadSizes={photoDownloadSizes}
                      allowPhotoDownloads={allowPhotoDownloads}
                      nameSize='xl'
                      bodyLayout='split'
                      trailingContent={headerSocialLinks.map(link => (
                        <SocialLinkComponent
                          key={link.id}
                          link={link}
                          handle={artist.handle}
                          artistName={artist.name}
                        />
                      ))}
                      className='w-full max-w-[38rem]'
                    />
                  </div>
                  <ArtistInfo
                    artist={artist}
                    subtitle={subtitle}
                    photoDownloadSizes={photoDownloadSizes}
                    allowPhotoDownloads={allowPhotoDownloads}
                    avatarSize={isCompactMobileHeader ? 'md' : 'lg'}
                    nameSize={isCompactMobileHeader ? 'sm' : 'lg'}
                    viewport='mobile'
                    className={`md:hidden ${
                      isCompactMobileHeader
                        ? '!space-y-2 sm:!space-y-2.5'
                        : '!space-y-2.5 sm:!space-y-3'
                    }`}
                  />
                  <div
                    data-testid='profile-content-stack'
                    className={isCompactMobileHeader ? 'pt-1' : ''}
                  >
                    {children}
                  </div>
                </div>

                {(showSocialBar ||
                  showTourButton ||
                  hasTipSupport ||
                  hasContacts ||
                  showShopButton) && (
                  <div className='mt-auto pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-6 sm:pt-8'>
                    <nav
                      className='mx-auto flex w-full max-w-sm items-center justify-center gap-2 rounded-full border border-[color:var(--profile-dock-border)] bg-[var(--profile-dock-bg)] px-2 py-2 shadow-[var(--profile-dock-shadow)] backdrop-blur-2xl sm:gap-3'
                      aria-label='Profile modes'
                      data-testid='profile-mode-nav'
                    >
                      <CircleIconButton
                        size='md'
                        variant='pearl'
                        ariaLabel='Profile'
                        data-testid='profile-trigger'
                        className={`transition-[background-color,color,box-shadow] ${
                          !mode || mode === 'profile'
                            ? 'bg-[var(--profile-pearl-bg-active)] text-primary-token'
                            : 'border-transparent bg-transparent text-tertiary-token shadow-none hover:border-[color:var(--profile-pearl-border)] hover:bg-[var(--profile-pearl-bg)] hover:text-primary-token'
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
                          variant='pearl'
                          ariaLabel='Contact'
                          data-testid='contact-trigger'
                          className={`transition-[background-color,color,box-shadow] ${
                            mode === 'contact'
                              ? 'bg-[var(--profile-pearl-bg-active)] text-primary-token'
                              : 'border-transparent bg-transparent text-tertiary-token shadow-none hover:border-[color:var(--profile-pearl-border)] hover:bg-[var(--profile-pearl-bg)] hover:text-primary-token'
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
                          variant='pearl'
                          ariaLabel='Tour dates'
                          data-testid='tour-trigger'
                          className={`transition-[background-color,color,box-shadow] ${
                            isTourModeActive
                              ? 'bg-[var(--profile-pearl-bg-active)] text-primary-token'
                              : 'border-transparent bg-transparent text-tertiary-token shadow-none hover:border-[color:var(--profile-pearl-border)] hover:bg-[var(--profile-pearl-bg)] hover:text-primary-token'
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
                          variant='pearl'
                          ariaLabel='Shop'
                          data-testid='shop-trigger'
                          className='border-transparent bg-transparent text-tertiary-token shadow-none transition-[background-color,color,box-shadow] hover:border-[color:var(--profile-pearl-border)] hover:bg-[var(--profile-pearl-bg)] hover:text-primary-token'
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
                          variant='pearl'
                          ariaLabel='Tip'
                          data-testid='tip-trigger'
                          className={`transition-[background-color,color,box-shadow] ${
                            isTipModeActive
                              ? 'bg-[var(--profile-pearl-bg-active)] text-primary-token'
                              : 'border-transparent bg-transparent text-tertiary-token shadow-none hover:border-[color:var(--profile-pearl-border)] hover:bg-[var(--profile-pearl-bg)] hover:text-primary-token'
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
                    </nav>
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
