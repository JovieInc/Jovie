'use client';

// @coverage-via apps/web/tests/components/profile/ProfileDrawerShell.interaction.test.tsx

import { Switch } from '@jovie/ui';
import { BellOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef } from 'react';
import { ChannelIcon } from '@/features/profile/artist-contacts-button/ContactIcons';
import { formatPublicContactChannelAriaLabel } from '@/features/profile/artist-contacts-button/contact-channel-label';
import { useArtistContacts } from '@/features/profile/artist-contacts-button/useArtistContacts';
import { ArtistNotificationsCTA } from '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA';
import { TwoStepNotificationsCTA } from '@/features/profile/artist-notifications-cta/TwoStepNotificationsCTA';
import { TourDrawerContent } from '@/features/profile/TourModePanel';
import {
  extractVenmoUsername,
  isAllowedVenmoUrl,
} from '@/features/profile/utils/venmo';
import { PublicShareActionList } from '@/features/share/PublicShareMenu';
import { getFocusableElements } from '@/lib/a11y/modal-focus-boundary';
import { track } from '@/lib/analytics';
import { formatPublicContactSubtitle } from '@/lib/contacts/format-public-contact';
import type { PublicContact, PublicContactChannel } from '@/types/contacts';
import { NOTIFICATION_CONTENT_TYPES } from '@/types/notifications';
import { AboutSection } from './AboutSection';
import type {
  DrawerView,
  ProfileUnifiedDrawerProps,
} from './ProfileUnifiedDrawer';
import {
  PROFILE_DRAWER_DANGER_ITEM_CLASS,
  PROFILE_DRAWER_META_CLASS,
  PROFILE_DRAWER_TITLE_CLASS,
  PROFILE_DRAWER_TOGGLE_ROW_CLASS,
} from './profile-drawer-classes';
import type { PublicRelease } from './releases/types';
import { StaticListenInterface } from './StaticListenInterface';
import { MenuView } from './views/MenuView';
import { PayView } from './views/PayView';
import { ReleasesView } from './views/ReleasesView';

interface ProfileUnifiedDrawerContentProps extends ProfileUnifiedDrawerProps {
  readonly renderedView: DrawerView;
  readonly visibleReleases: PublicRelease[];
  readonly canOpenReleasesDrawer: boolean;
  readonly canOpenTourDrawer: boolean;
}

const PAY_AMOUNTS = [5, 10, 20];

function ContactList({
  artistHandle,
  contacts,
  primaryChannel,
}: {
  readonly artistHandle: string;
  readonly contacts: PublicContact[];
  readonly primaryChannel: (contact: PublicContact) => PublicContactChannel;
}) {
  const { getActionHref, trackAction } = useArtistContacts({
    contacts,
    artistHandle,
  });

  return (
    <div
      className='flex flex-col gap-0.5'
      data-testid='profile-mode-drawer-contact'
    >
      {contacts.map(contact => {
        const primary = primaryChannel(contact);
        const primaryHref = getActionHref(primary);
        const subtitle = formatPublicContactSubtitle(contact);

        return (
          <div key={contact.id} className={PROFILE_DRAWER_TOGGLE_ROW_CLASS}>
            {primaryHref ? (
              <a
                href={primaryHref}
                className='flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left'
                onClick={() => trackAction(primary, contact)}
              >
                <span className={PROFILE_DRAWER_TITLE_CLASS}>
                  {contact.roleLabel}
                </span>
                {subtitle ? (
                  <span
                    className={PROFILE_DRAWER_META_CLASS}
                    data-testid='profile-mode-drawer-contact-meta'
                  >
                    {subtitle}
                  </span>
                ) : null}
              </a>
            ) : null}
            <div className='flex shrink-0 items-center gap-2'>
              {contact.channels.map(channel => {
                const channelHref = getActionHref(channel);
                if (!channelHref) return null;
                return (
                  <a
                    key={`${contact.id}-${channel.type}`}
                    href={channelHref}
                    className='flex h-8 w-8 items-center justify-center rounded-full text-tertiary-token transition-colors duration-subtle ease-subtle hover:bg-interactive-active hover:text-primary-token'
                    aria-label={formatPublicContactChannelAriaLabel(
                      channel.type,
                      contact
                    )}
                    onClick={() => trackAction(channel, contact)}
                    data-testid='contact-drawer-channel-action'
                  >
                    <ChannelIcon type={channel.type} />
                  </a>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProfileUnifiedDrawerContent({
  open,
  onOpenChange,
  view,
  onViewChange,
  artist,
  socialLinks,
  contacts,
  primaryChannel,
  dsps,
  isSubscribed,
  contentPrefs,
  onTogglePref,
  onUnsubscribe,
  isUnsubscribing,
  shareContext,
  enableDynamicEngagement = false,
  subscribeTwoStep = false,
  hasTip,
  hasContacts,
  genres,
  pressPhotos = [],
  allowPhotoDownloads = false,
  creditSegments,
  tourDates = [],
  renderedView,
  visibleReleases,
  canOpenReleasesDrawer,
  canOpenTourDrawer,
  onOpenReleaseCredits,
}: ProfileUnifiedDrawerContentProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const content = contentRef.current;
    // The pending Cancel button can disappear when the module arrives. Keep
    // focus in the same modal without replacing its original return target.
    if (!open || !content || document.activeElement !== document.body) return;
    const target =
      getFocusableElements(content)[0] ??
      content.closest<HTMLElement>('[role="dialog"], dialog');
    target?.focus({ preventScroll: true });
  }, [open]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      onOpenChange(next);
    },
    [onOpenChange]
  );

  const navigateTo = useCallback(
    (next: DrawerView) => {
      onViewChange(next);
    },
    [onViewChange]
  );

  // Track mode views
  useEffect(() => {
    if (!open) return;
    switch (view) {
      case 'listen':
        track('listen_drawer_open', { handle: artist.handle });
        break;
      case 'contact':
        track('contacts_drawer_open', {
          handle: artist.handle,
          contacts_count: contacts.length,
        });
        break;
      case 'pay':
        track('tip_drawer_open', { handle: artist.handle });
        // @ts-expect-error joviePixel is injected by JoviePixel
        globalThis.joviePixel?.track?.('tip_page_view');
        break;
      case 'releases':
        track('releases_drawer_open', {
          handle: artist.handle,
          releases_count: visibleReleases.length,
        });
        break;
      case 'tour':
        if (canOpenTourDrawer) {
          track('tour_drawer_open', {
            handle: artist.handle,
            tour_dates_count: tourDates.length,
          });
        }
        break;
      default:
        break;
    }
  }, [
    open,
    view,
    artist.handle,
    canOpenTourDrawer,
    contacts.length,
    tourDates.length,
    visibleReleases.length,
  ]);

  const venmoLink =
    socialLinks.find(link => link.platform === 'venmo')?.url ?? null;
  const hasValidVenmoLink = venmoLink !== null && isAllowedVenmoUrl(venmoLink);
  const venmoUsername = extractVenmoUsername(venmoLink);

  return (
    <AnimatePresence mode='wait' initial={false}>
      <motion.div
        ref={contentRef}
        key={renderedView}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12, ease: 'linear' }}
      >
        {renderedView === 'menu' && (
          <MenuView
            onNavigate={next => navigateTo(next as DrawerView)}
            hasReleases={canOpenReleasesDrawer}
            hasTourDates={canOpenTourDrawer}
            hasTip={hasTip}
            hasContacts={hasContacts}
            onOpenReleaseCredits={
              onOpenReleaseCredits
                ? () => {
                    handleOpenChange(false);
                    onOpenReleaseCredits();
                  }
                : undefined
            }
          />
        )}

        {renderedView === 'share' && (
          <PublicShareActionList
            context={shareContext}
            onActionComplete={() => handleOpenChange(false)}
          />
        )}

        {renderedView === 'notifications' && (
          <div className='flex flex-col gap-1'>
            {NOTIFICATION_CONTENT_TYPES.map(pref => (
              <div key={pref.key} className={PROFILE_DRAWER_TOGGLE_ROW_CLASS}>
                <div className='flex flex-col gap-0.5'>
                  <span className={PROFILE_DRAWER_TITLE_CLASS}>
                    {pref.label}
                  </span>
                  <span className={PROFILE_DRAWER_META_CLASS}>
                    {pref.description}
                  </span>
                </div>
                <Switch
                  checked={contentPrefs[pref.key]}
                  onCheckedChange={() => onTogglePref(pref.key)}
                  aria-label={pref.label}
                />
              </div>
            ))}

            <div className='mx-1 my-1 h-px bg-[color:var(--color-border-subtle)]' />

            {/* A plain destructive button: this notifications list is not
                  an ARIA menu, so the unsubscription control must not claim
                  `role="menuitem"` (axe aria-required-parent). */}
            <button
              type='button'
              className={PROFILE_DRAWER_DANGER_ITEM_CLASS}
              onClick={onUnsubscribe}
              disabled={isUnsubscribing}
            >
              <BellOff className='size-4 text-error/60' />
              {isUnsubscribing ? 'Turning off\u2026' : 'Turn off notifications'}
            </button>
          </div>
        )}

        {renderedView === 'listen' && (
          <div
            className='flex justify-center'
            data-testid='profile-mode-drawer-listen'
          >
            <StaticListenInterface
              artist={artist}
              handle={artist.handle}
              dspsOverride={dsps}
              enableDynamicEngagement={enableDynamicEngagement}
            />
          </div>
        )}

        {renderedView === 'subscribe' && (
          <div data-testid='profile-mode-drawer-subscribe'>
            {subscribeTwoStep ? (
              <TwoStepNotificationsCTA
                artist={artist}
                startExpanded
                presentation='overlay'
              />
            ) : (
              <ArtistNotificationsCTA
                artist={artist}
                presentation='overlay'
                variant='button'
                autoOpen
                forceExpanded
                hideListenFallback
              />
            )}
          </div>
        )}

        {renderedView === 'contact' && (
          <ContactList
            artistHandle={artist.handle}
            contacts={contacts}
            primaryChannel={primaryChannel}
          />
        )}

        {renderedView === 'about' && (
          <div data-testid='profile-mode-drawer-about'>
            <AboutSection
              artist={artist}
              genres={genres}
              pressPhotos={pressPhotos}
              allowPhotoDownloads={allowPhotoDownloads}
              creditSegments={creditSegments}
              contacts={contacts}
            />
          </div>
        )}

        {renderedView === 'tour' && (
          <div data-testid='profile-mode-drawer-tour'>
            <TourDrawerContent artist={artist} tourDates={tourDates} />
          </div>
        )}

        {renderedView === 'releases' && canOpenReleasesDrawer && (
          <ReleasesView
            releases={visibleReleases}
            artistId={artist.id}
            artistHandle={artist.handle}
            artistName={artist.name}
          />
        )}

        {renderedView === 'pay' && (
          <div data-testid='profile-mode-drawer-pay'>
            {hasValidVenmoLink ? (
              <>
                <div
                  className='mb-4 text-center'
                  data-testid='profile-pay-recipient'
                >
                  <p className='text-sm font-semibold text-primary-token'>
                    Pay {artist.name}
                  </p>
                  <p className='mt-1 text-xs text-tertiary-token'>
                    @{artist.handle}
                  </p>
                </div>
                <PayView
                  profileId={artist.id}
                  artistHandle={artist.handle}
                  venmoLink={venmoLink ?? ''}
                  venmoUsername={venmoUsername}
                  amounts={PAY_AMOUNTS}
                />
              </>
            ) : (
              <div className='rounded-(--profile-drawer-radius-mobile) border border-subtle bg-[color:var(--color-interactive-hover)] px-4 py-5 text-center'>
                <p className='text-sm font-semibold text-primary-token'>
                  Payments not available yet
                </p>
                <p className='mt-2 text-sm leading-6 text-tertiary-token'>
                  This profile has not added a public Venmo link.
                </p>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
