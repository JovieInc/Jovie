'use client';

import { Switch } from '@jovie/ui';
import {
  Bell,
  BellOff,
  CalendarDays,
  ChevronRight,
  Disc3,
  Info,
  Mail,
  Share2,
  Ticket,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
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
  PROFILE_DRAWER_MENU_ITEM_CLASS,
  PROFILE_DRAWER_META_CLASS,
  PROFILE_DRAWER_TITLE_CLASS,
  PROFILE_DRAWER_TOGGLE_ROW_CLASS,
} from './profile-drawer-classes';
import type { PublicRelease } from './releases/types';
import { StaticListenInterface } from './StaticListenInterface';

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

interface DrawerMeta {
  readonly title: string;
  readonly subtitle?: string;
}

const VIEW_META: Record<DrawerView, DrawerMeta> = {
  menu: { title: 'Menu' },
  share: {
    title: 'Share',
    subtitle: 'Share this profile',
  },
  notifications: {
    title: 'Notifications',
    subtitle: 'Choose what you hear about.',
  },
  about: {
    title: 'About',
    subtitle: 'Profile details, genres, and press assets.',
  },
  listen: {
    title: 'Listen',
    subtitle: 'Stream or download on your favorite platform.',
  },
  subscribe: {
    title: 'Get Notified',
    subtitle: 'Get notified about new releases and shows.',
  },
  contact: {
    title: 'Contact',
    subtitle: 'Management, booking, press, and more.',
  },
  pay: {
    title: 'Pay',
    subtitle: 'Send support instantly with Venmo.',
  },
  tour: {
    title: 'Tour Dates',
    subtitle: 'Upcoming shows and ticket links.',
  },
  releases: {
    title: 'Releases',
    subtitle: 'Discography',
  },
};

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
  readonly hasAbout: boolean;
  readonly hasTourDates: boolean;
  readonly hasTip: boolean;
  readonly hasContacts: boolean;
  readonly genres?: string[] | null;
  readonly pressPhotos?: readonly PressPhoto[];
  readonly allowPhotoDownloads?: boolean;
  readonly tourDates?: TourDateViewModel[];
  readonly hasReleases: boolean;
  readonly releases?: readonly PublicRelease[];
  /** When provided, "Get Notified" closes drawer and triggers inline input reveal */
  readonly onRevealNotifications?: () => void;
}

const iconClass = 'h-[16px] w-[16px] text-white/40';

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

const YEAR_HEADER_THRESHOLD = 15;

function formatReleaseType(type: string): string {
  switch (type) {
    case 'single':
      return 'Single';
    case 'ep':
      return 'EP';
    case 'album':
      return 'Album';
    case 'compilation':
      return 'Compilation';
    case 'live':
      return 'Live';
    case 'mixtape':
      return 'Mixtape';
    case 'music_video':
      return 'Video';
    default:
      return 'Release';
  }
}

function ReleasesDrawerContent({
  releases,
  artistHandle,
  artistName,
}: {
  readonly releases: readonly PublicRelease[];
  readonly artistHandle: string;
  readonly artistName: string;
}) {
  const ownerNameLower = artistName.toLowerCase();

  // Pre-compute which releases get a year header (no mutation during render)
  const yearHeaderSet = useMemo(() => {
    const years = new Set(
      releases
        .map(r =>
          r.releaseDate
            ? new Date(r.releaseDate).getUTCFullYear().toString()
            : null
        )
        .filter(Boolean)
    );
    if (releases.length < YEAR_HEADER_THRESHOLD || years.size < 2) {
      return new Set<string>();
    }
    const headers = new Set<string>();
    let prev: string | null = null;
    for (const release of releases) {
      const year = release.releaseDate
        ? new Date(release.releaseDate).getUTCFullYear().toString()
        : null;
      if (year && year !== prev) {
        headers.add(release.id);
        prev = year;
      }
    }
    return headers;
  }, [releases]);

  return (
    <div
      className='flex flex-col gap-0.5'
      data-testid='profile-mode-drawer-releases'
    >
      {releases.map(release => {
        if (!release.slug) return null;

        const year = release.releaseDate
          ? new Date(release.releaseDate).getUTCFullYear().toString()
          : null;
        const showHeader = yearHeaderSet.has(release.id);

        const collabs = release.artistNames
          .filter(name => name.toLowerCase() !== ownerNameLower)
          .join(', ');

        const metaParts = [formatReleaseType(release.releaseType), year].filter(
          Boolean
        );

        const ariaLabel = collabs
          ? `View ${release.title} by ${collabs}`
          : `View ${release.title}`;

        return (
          <div key={release.id}>
            {showHeader ? (
              <div className='px-4 pb-1 pt-4 text-[11px] font-[510] text-white/30'>
                {year}
              </div>
            ) : null}
            <a
              href={`/${artistHandle}/${release.slug}`}
              className='flex items-center gap-3 rounded-xl px-4 py-3 transition-colors duration-150 ease-out hover:bg-white/[0.05] focus-visible:bg-white/[0.06] focus-visible:outline-none active:bg-white/[0.08]'
              aria-label={ariaLabel}
            >
              <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-md'>
                <ImageWithFallback
                  src={release.artworkUrl}
                  alt={release.title}
                  fill
                  sizes='40px'
                  className='object-cover'
                />
              </div>
              <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                <span className={`truncate ${PROFILE_DRAWER_TITLE_CLASS}`}>
                  {release.title}
                </span>
                <span className={PROFILE_DRAWER_META_CLASS}>
                  {collabs ? `${collabs} \u00b7 ` : ''}
                  {metaParts.join(' \u00b7 ')}
                  {release.releaseType === 'music_video' ? (
                    <span className='ml-1.5 rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-[510] text-white/50'>
                      Video
                    </span>
                  ) : null}
                </span>
              </div>
            </a>
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
  hasAbout,
  hasTourDates,
  hasTip,
  hasContacts,
  genres,
  pressPhotos = [],
  allowPhotoDownloads = false,
  tourDates = [],
  hasReleases,
  releases = [],
  onRevealNotifications,
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

  const meta =
    view === 'releases' && canOpenReleasesDrawer
      ? { title: 'Releases', subtitle: releasesSubtitle }
      : VIEW_META[view === 'releases' ? 'menu' : view];
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
            <div className='flex flex-col gap-0.5' role='menu'>
              <button
                type='button'
                role='menuitem'
                className={PROFILE_DRAWER_MENU_ITEM_CLASS}
                onClick={() => navigateTo('share')}
              >
                <Share2 className={iconClass} />
                Share Profile
              </button>

              {hasAbout ? (
                <button
                  type='button'
                  role='menuitem'
                  className={PROFILE_DRAWER_MENU_ITEM_CLASS}
                  onClick={() => navigateTo('about')}
                >
                  <Info className={iconClass} />
                  About
                </button>
              ) : null}

              {canOpenReleasesDrawer ? (
                <button
                  type='button'
                  role='menuitem'
                  className={PROFILE_DRAWER_MENU_ITEM_CLASS}
                  onClick={() => navigateTo('releases')}
                >
                  <Disc3 className={iconClass} />
                  Releases
                </button>
              ) : null}

              {hasTourDates ? (
                <button
                  type='button'
                  role='menuitem'
                  className={PROFILE_DRAWER_MENU_ITEM_CLASS}
                  onClick={() => navigateTo('tour')}
                >
                  <CalendarDays className={iconClass} />
                  Tour Dates
                </button>
              ) : null}

              {hasTip ? (
                <button
                  type='button'
                  role='menuitem'
                  className={PROFILE_DRAWER_MENU_ITEM_CLASS}
                  onClick={() => navigateTo('pay')}
                >
                  <Ticket className={iconClass} />
                  Pay
                </button>
              ) : null}

              {hasContacts ? (
                <button
                  type='button'
                  role='menuitem'
                  className={PROFILE_DRAWER_MENU_ITEM_CLASS}
                  onClick={() => navigateTo('contact')}
                >
                  <Mail className={iconClass} />
                  Contact
                </button>
              ) : null}

              {isSubscribed ? (
                <button
                  type='button'
                  role='menuitem'
                  className={`${PROFILE_DRAWER_MENU_ITEM_CLASS} justify-between`}
                  onClick={() => navigateTo('notifications')}
                >
                  <span className='flex items-center gap-3'>
                    <Bell className={iconClass} />
                    Notifications
                  </span>
                  <ChevronRight className='h-3.5 w-3.5 text-white/30' />
                </button>
              ) : (
                <button
                  type='button'
                  role='menuitem'
                  className={PROFILE_DRAWER_MENU_ITEM_CLASS}
                  onClick={() => {
                    if (onRevealNotifications) {
                      handleOpenChange(false);
                      // Small delay to let drawer close animation start
                      setTimeout(() => onRevealNotifications(), 200);
                    } else {
                      navigateTo('subscribe');
                    }
                  }}
                >
                  <Bell className={iconClass} />
                  Turn on notifications
                </button>
              )}
            </div>
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
            <ReleasesDrawerContent
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
                  <p className='text-sm font-[590] text-white/88'>
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
