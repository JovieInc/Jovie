'use client';

import { Switch } from '@jovie/ui';
import { BellOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { PaySelector } from '@/components/molecules/PaySelector';
import { ChannelIcon } from '@/features/profile/artist-contacts-button/ContactIcons';
import { useArtistContacts } from '@/features/profile/artist-contacts-button/useArtistContacts';
import { ArtistNotificationsCTA } from '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA';
import { TwoStepNotificationsCTA } from '@/features/profile/artist-notifications-cta/TwoStepNotificationsCTA';
import { TourDrawerContent } from '@/features/profile/TourModePanel';
import {
  extractVenmoUsername,
  isAllowedVenmoUrl,
} from '@/features/profile/utils/venmo';
import { PublicShareActionList } from '@/features/share/PublicShareMenu';
import { track } from '@/lib/analytics';
import type { AvailableDSP } from '@/lib/dsp';
import type { ShareContext } from '@/lib/share/types';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { PublicContact, PublicContactChannel } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import type { NotificationContentType } from '@/types/notifications';
import { NOTIFICATION_CONTENT_TYPES } from '@/types/notifications';
import type { PressPhoto } from '@/types/press-photos';
import { AboutSection } from './AboutSection';
import { ProfileDrawerShell } from './ProfileDrawerShell';
import {
  PROFILE_DRAWER_DANGER_ITEM_CLASS,
  PROFILE_DRAWER_META_CLASS,
  PROFILE_DRAWER_TITLE_CLASS,
  PROFILE_DRAWER_TOGGLE_ROW_CLASS,
} from './profile-drawer-classes';
import type { PublicRelease } from './releases/types';
import { StaticListenInterface } from './StaticListenInterface';
import { MenuView } from './views/MenuView';
import { ReleasesView } from './views/ReleasesView';
import { PROFILE_VIEW_REGISTRY } from './views/registry';

export type DrawerView =
  | 'menu'
  | 'share'
  | 'notifications'
  | 'about'
  | 'listen'
  | 'subscribe'
  | 'contact'
  | 'pay'
  | 'tour'
  | 'releases';

interface ProfileUnifiedDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly view: DrawerView;
  readonly onViewChange: (view: DrawerView) => void;
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly primaryChannel: (contact: PublicContact) => PublicContactChannel;
  readonly dsps: AvailableDSP[];
  readonly isSubscribed: boolean;
  readonly contentPrefs: Record<NotificationContentType, boolean>;
  readonly onTogglePref: (key: NotificationContentType) => void;
  readonly onUnsubscribe: () => void;
  readonly isUnsubscribing: boolean;
  readonly shareContext: ShareContext;
  readonly enableDynamicEngagement?: boolean;
  readonly subscribeTwoStep?: boolean;
  readonly hasTip: boolean;
  readonly hasContacts: boolean;
  readonly genres?: string[] | null;
  readonly pressPhotos?: readonly PressPhoto[];
  readonly allowPhotoDownloads?: boolean;
  readonly tourDates?: TourDateViewModel[];
  readonly hasReleases: boolean;
  readonly releases?: readonly PublicRelease[];
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
                {contact.secondaryLabel ? (
                  <span className={PROFILE_DRAWER_META_CLASS}>
                    {contact.secondaryLabel}
                  </span>
                ) : null}
              </a>
            ) : null}
            <div className='flex shrink-0 items-center gap-2'>
              {contact.channels.map(channel => {
                const channelHref = getActionHref(channel);
                if (!channelHref) return null;
                const labels: Record<string, string> = {
                  email: 'Email',
                  sms: 'Text',
                };
                return (
                  <a
                    key={`${contact.id}-${channel.type}`}
                    href={channelHref}
                    className='flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition-colors duration-normal hover:bg-white/[0.08] hover:text-white/80'
                    aria-label={`${labels[channel.type] ?? 'Call'} ${contact.roleLabel}`}
                    onClick={() => trackAction(channel, contact)}
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

export function ProfileUnifiedDrawer({
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
  tourDates = [],
  hasReleases,
  releases = [],
}: ProfileUnifiedDrawerProps) {
  const visibleReleases = useMemo(
    () => releases.filter(r => Boolean(r.slug)),
    [releases]
  );
  const canOpenReleasesDrawer = hasReleases && visibleReleases.length > 0;

  const releasesSubtitle = useMemo(() => {
    if (visibleReleases.length === 0) return 'Discography';
    const counts: Record<string, number> = {};
    for (const r of visibleReleases) {
      const type = r.releaseType === 'music_video' ? 'video' : r.releaseType;
      counts[type] = (counts[type] ?? 0) + 1;
    }
    const labels: Record<string, string> = {
      single: 'single',
      ep: 'EP',
      album: 'album',
      compilation: 'compilation',
      live: 'live',
      mixtape: 'mixtape',
      video: 'video',
      other: 'release',
    };
    const parts = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(
        ([type, count]) =>
          `${count} ${labels[type] ?? 'release'}${count > 1 ? 's' : ''}`
      );
    return parts.join(', ');
  }, [visibleReleases]);

  const registryKey = view === 'releases' ? 'menu' : view;
  const meta =
    view === 'releases' && canOpenReleasesDrawer
      ? { title: 'Releases', subtitle: releasesSubtitle }
      : PROFILE_VIEW_REGISTRY[registryKey];
  const renderedView =
    view === 'releases' && !canOpenReleasesDrawer ? 'menu' : view;

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
      default:
        break;
    }
  }, [open, view, artist.handle, contacts.length, visibleReleases.length]);

  useEffect(() => {
    if (view === 'releases' && !canOpenReleasesDrawer) {
      onViewChange('menu');
    }
  }, [canOpenReleasesDrawer, onViewChange, view]);

  const venmoLink =
    socialLinks.find(link => link.platform === 'venmo')?.url ?? null;
  const hasValidVenmoLink = venmoLink !== null && isAllowedVenmoUrl(venmoLink);
  const venmoUsername = extractVenmoUsername(venmoLink);

  const handleTipAmountSelected = useMemo(() => {
    return (amount: number) => {
      if (!venmoLink || !hasValidVenmoLink) {
        toast.error('Unable to open Venmo. The payment link is not valid.');
        return;
      }
      const sep = venmoLink.includes('?') ? '&' : '?';
      const url = `${venmoLink}${sep}utm_amount=${amount}&utm_username=${encodeURIComponent(venmoUsername ?? '')}`;
      // @ts-expect-error joviePixel is injected by JoviePixel
      globalThis.joviePixel?.track?.('tip_intent', {
        tipAmount: amount,
        tipMethod: 'venmo',
      });
      const win = globalThis.open(url, '_blank', 'noopener,noreferrer');
      if (!win) {
        toast.error(
          'Venmo could not be opened. Please allow pop-ups and try again.'
        );
      }
    };
  }, [hasValidVenmoLink, venmoLink, venmoUsername]);

  const isSubView = view !== 'menu';

  return (
    <ProfileDrawerShell
      open={open}
      onOpenChange={handleOpenChange}
      title={meta.title}
      subtitle={meta.subtitle}
      onBack={isSubView ? () => navigateTo('menu') : undefined}
      dataTestId='profile-menu-drawer'
    >
      <AnimatePresence mode='wait' initial={false}>
        <motion.div
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
              hasTip={hasTip}
              hasContacts={hasContacts}
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
                    className='data-[state=checked]:bg-green-500 data-[state=checked]:hover:bg-green-600 data-[state=unchecked]:bg-white/[0.16] data-[state=unchecked]:hover:bg-white/[0.22]'
                  />
                </div>
              ))}

              <div className='mx-1 my-1 h-px bg-white/[0.06]' />

              <button
                type='button'
                role='menuitem'
                className={PROFILE_DRAWER_DANGER_ITEM_CLASS}
                onClick={onUnsubscribe}
                disabled={isUnsubscribing}
              >
                <BellOff className='h-[16px] w-[16px] text-red-400/50' />
                {isUnsubscribing
                  ? 'Turning off\u2026'
                  : 'Turn off notifications'}
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
                <TwoStepNotificationsCTA artist={artist} startExpanded />
              ) : (
                <ArtistNotificationsCTA
                  artist={artist}
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
              artistHandle={artist.handle}
              artistName={artist.name}
            />
          )}

          {renderedView === 'pay' && (
            <div data-testid='profile-mode-drawer-pay'>
              {hasValidVenmoLink ? (
                <PaySelector
                  amounts={PAY_AMOUNTS}
                  onContinue={handleTipAmountSelected}
                  paymentLabel='Venmo'
                />
              ) : (
                <div className='rounded-[var(--profile-drawer-radius-mobile)] border border-white/8 bg-white/[0.035] px-4 py-5 text-center'>
                  <p className='text-sm font-semibold text-white/88'>
                    Payments not available yet
                  </p>
                  <p className='mt-2 text-sm leading-6 text-white/54'>
                    This profile has not added a public Venmo link.
                  </p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </ProfileDrawerShell>
  );
}
