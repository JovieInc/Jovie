'use client';

import { BackgroundPattern } from '@/components/atoms/BackgroundPattern';
import { ProfileNavButton } from '@/components/atoms/ProfileNavButton';
import { ArtistInfo } from '@/components/molecules/ArtistInfo';
import { SocialLink as SocialLinkComponent } from '@/components/molecules/SocialLink';
import { ProfileNotificationsButton } from '@/components/organisms/ProfileNotificationsButton';
import { ProfileNotificationsMenu } from '@/components/organisms/profile-notifications-menu';
import { ArtistContactsButton } from '@/components/profile/artist-contacts-button';
import { ProfileFooter } from '@/components/profile/ProfileFooter';
import { Container } from '@/components/site/Container';
import { CTAButton } from '@/components/ui/CTAButton';
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
  showTipButton = false,
  showBackButton = false,
  showFooter = true,
  showNotificationButton = false,
  forceNotificationsEnabled = false,
  maxWidthClass = 'w-full max-w-md',
  backgroundPattern = 'grid',
  showGradientBlurs = true,
}: ProfileShellProps) {
  const {
    isTipNavigating,
    setIsTipNavigating,
    notificationsEnabled,
    notificationsController,
    notificationsContextValue,
    socialNetworkLinks,
    hasSocialLinks,
    hasContacts,
  } = useProfileShell({
    artist,
    socialLinks,
    contacts,
    forceNotificationsEnabled,
  });

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
            <div className='absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-surface-2 blur-3xl opacity-40' />
            <div className='absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-surface-3 blur-3xl opacity-35' />
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

          <div className='relative z-10 flex min-h-screen flex-col py-12'>
            <div className='flex flex-1 flex-col items-center justify-start px-4'>
              <div className={`${maxWidthClass} space-y-8`}>
                <ArtistInfo artist={artist} subtitle={subtitle} />
                {children}
                {(showSocialBar || showTipButton) && (
                  <div className='flex items-center justify-between gap-4'>
                    <div className='flex flex-1 justify-start'>
                      {showSocialBar && (
                        <div
                          className='flex items-center gap-3'
                          data-testid='social-links'
                        >
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
                                <div className='flex items-center space-x-2 rounded-lg border border-dashed border-subtle bg-surface-1 px-3 py-2 text-secondary-token'>
                                  <svg
                                    className='h-4 w-4 text-secondary-token'
                                    fill='none'
                                    stroke='currentColor'
                                    viewBox='0 0 24 24'
                                    aria-hidden='true'
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
