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
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { ArtistInfo } from '@/components/molecules/ArtistInfo';
import { ProfileNavButton } from '@/components/molecules/ProfileNavButton';
import { SocialLink as SocialLinkComponent } from '@/components/molecules/SocialLink';
import { ProfileNotificationsButton } from '@/components/organisms/ProfileNotificationsButton';
import {
  PublicSurfaceFooter,
  PublicSurfaceHeader,
  PublicSurfaceShell,
  PublicSurfaceStage,
} from '@/components/organisms/public-surface';
import { ProfileFooter } from '@/features/profile/ProfileFooter';
import { extractVenmoUsername } from '@/features/profile/utils/venmo';

const PayDrawer = dynamic(
  () =>
    import('@/features/profile/PayDrawer').then(mod => ({
      default: mod.PayDrawer,
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
  showPayButton = false,
  isPayModeActive = false,
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
  const [payDrawerOpen, setPayDrawerOpen] = useState(false);

  // Fire tip_page_view pixel event when pay mode is active on page load
  useEffect(() => {
    if (!isPayModeActive) return;
    // @ts-expect-error - joviePixel is set by JoviePixel component
    if (globalThis.joviePixel?.track) {
      // @ts-expect-error - joviePixel is set by JoviePixel component
      globalThis.joviePixel.track('tip_page_view');
    }
  }, [isPayModeActive]);

  // Extract venmo link from social links for the pay drawer
  const venmoLink = useMemo(
    () => socialLinks.find(l => l.platform === 'venmo')?.url ?? null,
    [socialLinks]
  );
  const venmoUsername = useMemo(
    () => extractVenmoUsername(venmoLink),
    [venmoLink]
  );
  const hasPaySupport = showPayButton && Boolean(venmoLink);
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
      <div id='main-content' data-test='public-profile-root'>
        <PublicSurfaceShell
          backgroundPattern={backgroundPattern}
          showGradientBlurs={showGradientBlurs}
          className='min-h-dvh bg-[color:var(--profile-stage-bg)] text-primary-token font-medium tracking-tight md:min-h-dvh'
        >
          <div
            className='pointer-events-none absolute inset-0 bg-[var(--profile-stage-overlay)]'
            aria-hidden='true'
          />

          <PublicSurfaceStage>
            <PublicSurfaceHeader
              className='absolute inset-x-4 top-3.5 z-20 md:top-4'
              leftSlot={
                <ProfileNavButton
                  showBackButton={showBackButton}
                  artistHandle={artist.handle}
                />
              }
              rightSlot={renderNotificationControls()}
            />

            <div className='relative z-10 flex min-h-full flex-1 flex-col pb-4 pt-12 sm:pb-6 sm:pt-14'>
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
                        className='w-full max-w-(--profile-shell-header-max-width)'
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
                    hasPaySupport ||
                    hasContacts ||
                    showShopButton) && (
                    <PublicSurfaceFooter className='mt-auto pt-6 sm:pt-8'>
                      <nav
                        className='mx-auto flex w-full max-w-sm items-center justify-center gap-2 rounded-full border border-[color:var(--profile-dock-border)] bg-[var(--profile-dock-bg)] px-2 py-2 shadow-[var(--profile-dock-shadow)] backdrop-blur-2xl sm:gap-3'
                        aria-label='Profile Modes'
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
                        {showTourButton && (
                          <CircleIconButton
                            size='md'
                            variant='pearl'
                            ariaLabel='Tour Dates'
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
                            <ShoppingBag
                              className='h-4 w-4'
                              aria-hidden='true'
                            />
                          </CircleIconButton>
                        )}

                        {hasPaySupport && venmoLink && (
                          <CircleIconButton
                            size='md'
                            variant='pearl'
                            ariaLabel='Pay'
                            data-testid='pay-trigger'
                            className={`transition-[background-color,color,box-shadow] ${
                              isPayModeActive
                                ? 'bg-[var(--profile-pearl-bg-active)] text-primary-token'
                                : 'border-transparent bg-transparent text-tertiary-token shadow-none hover:border-[color:var(--profile-pearl-border)] hover:bg-[var(--profile-pearl-bg)] hover:text-primary-token'
                            }`}
                            onClick={() => {
                              if (isMobile) {
                                setPayDrawerOpen(true);
                                return;
                              }
                              router.push(`/${artist.handle}?mode=pay`);
                            }}
                          >
                            <DollarSign
                              className='h-4 w-4'
                              aria-hidden='true'
                            />
                          </CircleIconButton>
                        )}
                      </nav>
                    </PublicSurfaceFooter>
                  )}
                </div>
              </div>

              {hasPaySupport && venmoLink && isMobile ? (
                <PayDrawer
                  open={payDrawerOpen}
                  onOpenChange={setPayDrawerOpen}
                  artistName={artist.name}
                  artistHandle={artist.handle}
                  venmoLink={venmoLink}
                  venmoUsername={venmoUsername}
                />
              ) : null}

              {showFooter ? <ProfileFooter artist={artist} /> : null}
            </div>
          </PublicSurfaceStage>
        </PublicSurfaceShell>
      </div>
    </ProfileNotificationsContext.Provider>
  );
}
