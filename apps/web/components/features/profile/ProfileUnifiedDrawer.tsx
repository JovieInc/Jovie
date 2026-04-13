'use client';

import { Switch } from '@jovie/ui';
import {
  ArrowRight,
  Bell,
  BellOff,
  CalendarDays,
  CheckCircle2,
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
import {
  ArtistNotificationsCTA,
  TwoStepNotificationsCTA,
} from '@/features/profile/artist-notifications-cta';
import {
  SubscriptionPearlComposer,
  subscriptionPrimaryActionClassName,
} from '@/features/profile/artist-notifications-cta/shared';
import type {
  ProfilePreviewNotificationsState,
  ProfileRenderMode,
  ProfileSurfacePresentation,
} from '@/features/profile/contracts';
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
import { ProfileContactDrawerContent } from './ProfileContactDrawerContent';
import { ProfileDrawerShell } from './ProfileDrawerShell';
import { ProfileTipDrawerContent } from './ProfileTipDrawerContent';
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
    subtitle: 'Choose your updates.',
  },
  about: {
    title: 'About',
    subtitle: 'Profile details and press assets.',
  },
  listen: {
    title: 'Listen',
    subtitle: 'Stream on your favorite platform.',
  },
  subscribe: {
    title: 'Turn on notifications',
    subtitle: 'New releases and shows.',
  },
  contact: {
    title: 'Contact',
    subtitle: 'Booking, management, and press.',
  },
  tip: {
    title: 'Pay',
    subtitle: 'Support in one tap',
  },
  tour: {
    title: 'Tour Dates',
    subtitle: 'Upcoming shows and tickets.',
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
  readonly onRevealNotifications?: () => void;
  readonly renderMode?: ProfileRenderMode;
  readonly presentation?: ProfileSurfacePresentation;
  readonly previewNotificationsState?: ProfilePreviewNotificationsState;
}

const menuItemClass =
  'flex w-full items-center gap-3 rounded-[14px] px-4 py-3 text-left text-[14px] font-[470] text-white/88 transition-colors duration-150 active:bg-white/[0.06]';
const iconClass = 'h-[16px] w-[16px] text-white/40';
const TIP_AMOUNTS = [5, 10, 20] as const;

function PreviewSubscribePanel({
  notifications,
}: Readonly<{
  notifications: ProfilePreviewNotificationsState;
}>) {
  const kind = notifications.kind ?? 'button';

  if (kind === 'status') {
    return (
      <div data-testid='profile-mode-drawer-subscribe'>
        <button
          type='button'
          className={`${subscriptionPrimaryActionClassName} h-12 w-full justify-center gap-2 px-6`}
        >
          <CheckCircle2 className='h-4 w-4 shrink-0 text-green-400' />
          {notifications.label || 'Notifications on'}
        </button>
      </div>
    );
  }

  if (kind === 'button') {
    return (
      <div data-testid='profile-mode-drawer-subscribe'>
        <button
          type='button'
          className={`${subscriptionPrimaryActionClassName} h-12 w-full justify-center gap-2 px-6`}
        >
          <Bell className='h-4 w-4' />
          Turn on notifications
        </button>
      </div>
    );
  }

  return (
    <div className='space-y-4' data-testid='profile-mode-drawer-subscribe'>
      <SubscriptionPearlComposer
        action={
          <span
            className={`${subscriptionPrimaryActionClassName} !h-10 !w-10 !px-0`}
          >
            <ArrowRight className='h-4 w-4' />
          </span>
        }
      >
        <div className='min-w-0 px-2 py-1.5'>
          <p className='truncate text-[15px] font-[560] tracking-[-0.02em] text-white/86'>
            {notifications.value ?? 'fan@example.com'}
          </p>
        </div>
      </SubscriptionPearlComposer>
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
  renderMode = 'interactive',
  presentation = 'standalone',
  previewNotificationsState,
}: ProfileUnifiedDrawerProps) {
  const meta = VIEW_META[view];

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

  const handleShareAndClose = useCallback(() => {
    handleOpenChange(false);
    onShare();
  }, [handleOpenChange, onShare]);

  useEffect(() => {
    if (renderMode !== 'interactive' || !open) return;

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
  }, [artist.handle, contacts.length, open, renderMode, view]);

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

  const isSecondaryView = view === 'notifications';

  return (
    <ProfileDrawerShell
      open={open}
      onOpenChange={handleOpenChange}
      title={meta.title}
      subtitle={meta.subtitle}
      onBack={isSecondaryView ? () => navigateTo('menu') : undefined}
      navigationLevel={isSecondaryView ? 'secondary' : 'root'}
      dataTestId='profile-menu-drawer'
      presentation={presentation}
    >
      {/* menu owns navigation; content views reuse shared tip/contact primitives across route + homepage */}
      <AnimatePresence mode='wait' initial={false}>
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15, ease: [0.32, 0, 0.67, 1] }}
        >
          {view === 'menu' ? (
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
                  Pay
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
          ) : null}

          {view === 'notifications' ? (
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
                {isUnsubscribing ? 'Turning off…' : 'Turn off notifications'}
              </button>
            </div>
          ) : null}

          {view === 'listen' ? (
            <div
              className='flex justify-center'
              data-testid='profile-mode-drawer-listen'
            >
              <StaticListenInterface
                artist={artist}
                handle={artist.handle}
                dspsOverride={dsps}
                enableDynamicEngagement={enableDynamicEngagement}
                renderMode={renderMode}
              />
            </div>
          ) : null}

          {view === 'subscribe' ? (
            renderMode === 'preview' && previewNotificationsState ? (
              <PreviewSubscribePanel
                notifications={previewNotificationsState}
              />
            ) : (
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
            )
          ) : null}

          {view === 'contact' ? (
            <div data-testid='profile-mode-drawer-contact'>
              <ProfileContactDrawerContent
                artistHandle={artist.handle}
                contacts={contacts}
                primaryChannel={primaryChannel}
                interactive={renderMode === 'interactive'}
              />
            </div>
          ) : null}

          {view === 'about' ? (
            <div data-testid='profile-mode-drawer-about'>
              <AboutSection
                artist={artist}
                genres={genres}
                pressPhotos={pressPhotos}
                allowPhotoDownloads={allowPhotoDownloads}
              />
            </div>
          ) : null}

          {view === 'tour' ? (
            <div data-testid='profile-mode-drawer-tour'>
              <TourDrawerContent
                artist={artist}
                tourDates={tourDates}
                compact
                renderMode={renderMode}
              />
            </div>
          ) : null}

          {view === 'tip' ? (
            <div data-testid='profile-mode-drawer-tip'>
              {hasValidVenmoLink ? (
                <ProfileTipDrawerContent
                  amounts={TIP_AMOUNTS}
                  interactive={renderMode === 'interactive'}
                  onAmountSelected={handleTipAmountSelected}
                />
              ) : (
                <div className='rounded-[24px] border border-white/8 bg-white/[0.035] px-4 py-5 text-center'>
                  <p className='text-sm font-[590] text-white/88'>
                    Pay is not available yet
                  </p>
                  <p className='mt-2 text-sm leading-6 text-white/54'>
                    This profile has not added a public Venmo link.
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </ProfileDrawerShell>
  );
}
