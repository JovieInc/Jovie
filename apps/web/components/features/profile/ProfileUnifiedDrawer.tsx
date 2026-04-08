'use client';

import { Switch } from '@jovie/ui';
import {
  Bell,
  BellOff,
  CalendarDays,
  ChevronRight,
  Info,
  Mail,
  Share2,
  Ticket,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { TipSelector } from '@/components/molecules/TipSelector';
import { ChannelIcon } from '@/features/profile/artist-contacts-button/ContactIcons';
import { useArtistContacts } from '@/features/profile/artist-contacts-button/useArtistContacts';
import {
  ArtistNotificationsCTA,
  TwoStepNotificationsCTA,
} from '@/features/profile/artist-notifications-cta';
import { TourDrawerContent } from '@/features/profile/TourModePanel';
import {
  extractVenmoUsername,
  isAllowedVenmoUrl,
} from '@/features/profile/utils/venmo';
import { track } from '@/lib/analytics';
import type { AvailableDSP } from '@/lib/dsp';
import type { PublicContact, PublicContactChannel } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import type { NotificationContentType } from '@/types/notifications';
import { NOTIFICATION_CONTENT_TYPES } from '@/types/notifications';
import type { PressPhoto } from '@/types/press-photos';
import { AboutSection } from './AboutSection';
import { ProfileDrawerShell } from './ProfileDrawerShell';
import { StaticListenInterface } from './StaticListenInterface';

export type DrawerView =
  | 'menu'
  | 'notifications'
  | 'about'
  | 'listen'
  | 'subscribe'
  | 'contact'
  | 'tip'
  | 'tour';

interface DrawerMeta {
  readonly title: string;
  readonly subtitle?: string;
}

const VIEW_META: Record<DrawerView, DrawerMeta> = {
  menu: { title: 'Menu' },
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
  tip: {
    title: 'Tip',
    subtitle: 'Send support instantly with Venmo.',
  },
  tour: {
    title: 'Tour Dates',
    subtitle: 'Upcoming shows and ticket links.',
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
  readonly onShare: () => void;
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
  /** When provided, "Get Notified" closes drawer and triggers inline input reveal */
  readonly onRevealNotifications?: () => void;
}

const menuItemClass =
  'flex w-full items-center gap-3 rounded-[14px] px-4 py-3 text-left text-[14px] font-[470] text-white/88 transition-colors duration-150 active:bg-white/[0.06]';
const iconClass = 'h-[16px] w-[16px] text-white/40';

const TIP_AMOUNTS = [3, 5, 7];

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
    <div className='flex flex-col gap-0.5'>
      {contacts.map(contact => {
        const primary = primaryChannel(contact);
        const primaryHref = getActionHref(primary);

        return (
          <div
            key={contact.id}
            className='flex items-center justify-between gap-4 rounded-[14px] px-4 py-3'
          >
            {primaryHref ? (
              <a
                href={primaryHref}
                className='flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left'
                onClick={() => trackAction(primary, contact)}
              >
                <span className='text-[14px] font-[470] text-white/88'>
                  {contact.roleLabel}
                </span>
                {contact.secondaryLabel ? (
                  <span className='text-[11px] font-[400] text-white/40'>
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
                    className='flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white/80'
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
  onShare,
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
  onRevealNotifications,
}: ProfileUnifiedDrawerProps) {
  const meta = VIEW_META[view];

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        // Reset to menu when drawer closes
        setTimeout(() => onViewChange('menu'), 200);
      }
      onOpenChange(next);
    },
    [onOpenChange, onViewChange]
  );

  const navigateTo = useCallback(
    (next: DrawerView) => {
      onViewChange(next);
    },
    [onViewChange]
  );

  const handleShareAndClose = useCallback(() => {
    handleOpenChange(false);
    onShare();
  }, [handleOpenChange, onShare]);

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
      case 'tip':
        track('tip_drawer_open', { handle: artist.handle });
        // @ts-expect-error joviePixel is injected by JoviePixel
        globalThis.joviePixel?.track?.('tip_page_view');
        break;
      default:
        break;
    }
  }, [open, view, artist.handle, contacts.length]);

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
          key={view}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15, ease: [0.32, 0, 0.67, 1] }}
        >
          {view === 'menu' && (
            <div className='flex flex-col gap-0.5' role='menu'>
              <button
                type='button'
                role='menuitem'
                className={menuItemClass}
                onClick={handleShareAndClose}
              >
                <Share2 className={iconClass} />
                Share Profile
              </button>

              {hasAbout ? (
                <button
                  type='button'
                  role='menuitem'
                  className={menuItemClass}
                  onClick={() => navigateTo('about')}
                >
                  <Info className={iconClass} />
                  About
                </button>
              ) : null}

              {hasTourDates ? (
                <button
                  type='button'
                  role='menuitem'
                  className={menuItemClass}
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
                  className={menuItemClass}
                  onClick={() => navigateTo('tip')}
                >
                  <Ticket className={iconClass} />
                  Tip
                </button>
              ) : null}

              {hasContacts ? (
                <button
                  type='button'
                  role='menuitem'
                  className={menuItemClass}
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
                  className={`${menuItemClass} justify-between`}
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
                  className={menuItemClass}
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

          {view === 'notifications' && (
            <div className='flex flex-col gap-1'>
              {NOTIFICATION_CONTENT_TYPES.map(pref => (
                <div
                  key={pref.key}
                  className='flex w-full items-center justify-between rounded-[14px] px-4 py-3 text-left'
                >
                  <div className='flex flex-col gap-0.5'>
                    <span className='text-[14px] font-[470] text-white/88'>
                      {pref.label}
                    </span>
                    <span className='text-[11px] font-[400] text-white/40'>
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
                className='flex w-full items-center gap-3 rounded-[14px] px-4 py-3 text-left text-[14px] font-[470] text-red-400/85 transition-colors duration-150 active:bg-white/[0.06]'
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

          {view === 'listen' && (
            <div className='flex justify-center'>
              <StaticListenInterface
                artist={artist}
                handle={artist.handle}
                dspsOverride={dsps}
                enableDynamicEngagement={enableDynamicEngagement}
              />
            </div>
          )}

          {view === 'subscribe' && (
            <div>
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

          {view === 'contact' && (
            <ContactList
              artistHandle={artist.handle}
              contacts={contacts}
              primaryChannel={primaryChannel}
            />
          )}

          {view === 'about' && (
            <AboutSection
              artist={artist}
              genres={genres}
              pressPhotos={pressPhotos}
              allowPhotoDownloads={allowPhotoDownloads}
            />
          )}

          {view === 'tour' && (
            <TourDrawerContent artist={artist} tourDates={tourDates} compact />
          )}

          {view === 'tip' && (
            <div>
              {hasValidVenmoLink ? (
                <TipSelector
                  amounts={TIP_AMOUNTS}
                  onContinue={handleTipAmountSelected}
                  paymentLabel='Venmo'
                />
              ) : (
                <div className='rounded-[24px] border border-white/8 bg-white/[0.035] px-4 py-5 text-center'>
                  <p className='text-sm font-[590] text-white/88'>
                    Tipping is not available yet
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
