'use client';

import {
  Bell,
  CalendarDays,
  Disc3,
  Info,
  Mail,
  Music2,
  Ticket,
} from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { PaySelector } from '@/components/molecules/PaySelector';
import { ArtistNotificationsCTA } from '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA';
import { TwoStepNotificationsCTA } from '@/features/profile/artist-notifications-cta/TwoStepNotificationsCTA';
import type { ProfileMode } from '@/features/profile/contracts';
import { ProfileDrawerShell } from '@/features/profile/ProfileDrawerShell';
import { TourDrawerContent } from '@/features/profile/TourModePanel';
import {
  extractVenmoUsername,
  isAllowedVenmoUrl,
} from '@/features/profile/utils/venmo';
import { track } from '@/lib/analytics';
import type { AvailableDSP } from '@/lib/dsp';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { PublicContact, PublicContactChannel } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import type { PressPhoto } from '@/types/press-photos';
import { AboutSection } from './AboutSection';
import { ChannelIcon } from './artist-contacts-button/ContactIcons';
import { useArtistContacts } from './artist-contacts-button/useArtistContacts';
import { StaticListenInterface } from './StaticListenInterface';

export type ProfileDrawerMode = Exclude<ProfileMode, 'profile'>;

interface ProfileModeDrawerProps {
  readonly activeMode: ProfileDrawerMode | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly primaryChannel: (contact: PublicContact) => PublicContactChannel;
  readonly dsps: AvailableDSP[];
  readonly enableDynamicEngagement?: boolean;
  readonly subscribeTwoStep?: boolean;
  readonly genres?: string[] | null;
  readonly pressPhotos?: readonly PressPhoto[];
  readonly allowPhotoDownloads?: boolean;
  readonly tourDates?: TourDateViewModel[];
}

interface DrawerMeta {
  readonly title: string;
  readonly subtitle: string;
  readonly icon: typeof Music2;
}

const MODE_META: Record<ProfileDrawerMode, DrawerMeta> = {
  about: {
    title: 'About',
    subtitle: 'Profile details, genres, and press assets.',
    icon: Info,
  },
  contact: {
    title: 'Contact',
    subtitle: 'Management, booking, press, and more.',
    icon: Mail,
  },
  listen: {
    title: 'Listen',
    subtitle: 'Stream or download on your favorite platform.',
    icon: Music2,
  },
  subscribe: {
    title: 'Get Notified',
    subtitle: 'Get notified about new releases and shows.',
    icon: Bell,
  },
  pay: {
    title: 'Pay',
    subtitle: 'Send support instantly with Venmo.',
    icon: Ticket,
  },
  tour: {
    title: 'Tour Dates',
    subtitle: 'Upcoming shows and ticket links.',
    icon: CalendarDays,
  },
  releases: {
    title: 'Releases',
    subtitle: 'Full discography and streaming links.',
    icon: Disc3,
  },
};

const PAY_AMOUNTS = [5, 10, 20];

function ProfileModeFallback({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div
      className='rounded-[var(--profile-drawer-radius-mobile)] border border-white/8 bg-white/[0.035] px-4 py-5 text-center'
      data-testid='profile-mode-drawer-fallback'
    >
      <p className='text-sm font-semibold text-white/88'>{title}</p>
      <p className='mt-2 text-sm leading-6 text-white/54'>{description}</p>
    </div>
  );
}

function ProfileModeDrawerContactList({
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

  if (contacts.length === 0) {
    return (
      <ProfileModeFallback
        title='No contact options yet'
        description='This profile has not shared any public contact channels.'
      />
    );
  }

  return (
    <div className='space-y-3' data-testid='profile-mode-drawer-contact'>
      {contacts.map(contact => {
        const primary = primaryChannel(contact);
        const primaryHref = getActionHref(primary);

        return (
          <div
            key={contact.id}
            className='flex items-center justify-between gap-4 rounded-[var(--profile-inner-radius)] border border-white/8 bg-white/[0.035] px-4 py-4 shadow-[0_14px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl transition-[background-color,border-color] duration-normal ease-out hover:bg-white/[0.05]'
            data-testid='contact-drawer-item'
          >
            {primaryHref ? (
              <a
                href={primaryHref}
                className='flex min-w-0 flex-1 flex-col items-start gap-1.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
                onClick={() => trackAction(primary, contact)}
              >
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='text-sm font-semibold text-white/92'>
                    {contact.roleLabel}
                  </span>
                  {contact.territorySummary ? (
                    <span className='rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-2xs font-semibold text-white/58'>
                      {contact.territorySummary}
                    </span>
                  ) : null}
                </div>
                {contact.secondaryLabel ? (
                  <span className='text-xs text-white/58'>
                    {contact.secondaryLabel}
                  </span>
                ) : null}
                {contact.primaryContactLabel ? (
                  <span className='text-xs text-white/46'>
                    {contact.primaryContactLabel}
                  </span>
                ) : null}
              </a>
            ) : null}
            <div className='flex shrink-0 items-center gap-2'>
              {contact.channels.map(channel => {
                const channelHref = getActionHref(channel);
                if (!channelHref) return null;

                const channelLabels: Record<string, string> = {
                  email: 'Email',
                  sms: 'Text',
                };
                const channelLabel = channelLabels[channel.type] ?? 'Call';

                return (
                  <a
                    key={`${contact.id}-${channel.type}`}
                    href={channelHref}
                    className='flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/82 shadow-[0_14px_32px_rgba(0,0,0,0.18)] transition-[background-color,border-color] hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
                    aria-label={`${channelLabel} ${contact.roleLabel}`}
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

export function ProfileModeDrawer({
  activeMode,
  onOpenChange,
  artist,
  socialLinks,
  contacts,
  primaryChannel,
  dsps,
  enableDynamicEngagement = false,
  subscribeTwoStep = false,
  genres,
  pressPhotos = [],
  allowPhotoDownloads = false,
  tourDates = [],
}: Readonly<ProfileModeDrawerProps>) {
  const venmoLink =
    socialLinks.find(link => link.platform === 'venmo')?.url ?? null;
  const hasValidVenmoLink = venmoLink !== null && isAllowedVenmoUrl(venmoLink);
  const venmoUsername = extractVenmoUsername(venmoLink);
  const meta = activeMode ? MODE_META[activeMode] : null;

  useEffect(() => {
    if (!activeMode) {
      return;
    }

    switch (activeMode) {
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
      default:
        break;
    }
  }, [activeMode, artist.handle, contacts.length]);

  const handleTipAmountSelected = useMemo(() => {
    return (amount: number) => {
      if (!venmoLink || !hasValidVenmoLink) {
        track('tip_handoff_failed', {
          reason: 'invalid_venmo_url',
          handle: artist.handle,
          venmoLink,
        });
        toast.error('Unable to open Venmo. The payment link is not valid.');
        return;
      }

      const sep = venmoLink.includes('?') ? '&' : '?';
      const url = `${venmoLink}${sep}utm_amount=${amount}&utm_username=${encodeURIComponent(
        venmoUsername ?? ''
      )}`;

      // @ts-expect-error joviePixel is injected by JoviePixel
      globalThis.joviePixel?.track?.('tip_intent', {
        tipAmount: amount,
        tipMethod: 'venmo',
      });

      const win = globalThis.open(url, '_blank', 'noopener,noreferrer');
      if (!win) {
        track('tip_handoff_failed', {
          reason: 'popup_blocked',
          handle: artist.handle,
          amount,
        });
        toast.error(
          'Venmo could not be opened. Please allow pop-ups and try again.'
        );
      }
    };
  }, [artist.handle, hasValidVenmoLink, venmoLink, venmoUsername]);

  if (!activeMode || !meta) {
    return null;
  }

  return (
    <ProfileDrawerShell
      open
      onOpenChange={onOpenChange}
      title={meta.title}
      subtitle={meta.subtitle}
      dataTestId='profile-mode-drawer'
    >
      {activeMode === 'listen' ? (
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
      ) : null}

      {activeMode === 'subscribe' ? (
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
      ) : null}

      {activeMode === 'contact' ? (
        <ProfileModeDrawerContactList
          artistHandle={artist.handle}
          contacts={contacts}
          primaryChannel={primaryChannel}
        />
      ) : null}

      {activeMode === 'about' ? (
        <div data-testid='profile-mode-drawer-about'>
          <AboutSection
            artist={artist}
            genres={genres}
            pressPhotos={pressPhotos}
            allowPhotoDownloads={allowPhotoDownloads}
          />
        </div>
      ) : null}

      {activeMode === 'tour' ? (
        <div data-testid='profile-mode-drawer-tour'>
          <TourDrawerContent artist={artist} tourDates={tourDates} />
        </div>
      ) : null}

      {activeMode === 'releases' ? (
        <div data-testid='profile-mode-drawer-releases'>
          <ProfileModeFallback
            title='Releases'
            description='Full discography and streaming links.'
          />
        </div>
      ) : null}

      {activeMode === 'pay' ? (
        <div data-testid='profile-mode-drawer-pay'>
          {hasValidVenmoLink ? (
            <PaySelector
              amounts={PAY_AMOUNTS}
              onContinue={handleTipAmountSelected}
              presentation='drawer'
              primaryLabel='Send payment'
              paymentLabel='Venmo'
              showOtherPaymentOptions
              otherPaymentOptionsLabel='Other payment options'
            />
          ) : (
            <ProfileModeFallback
              title='Payments not available yet'
              description='This profile has not added a public Venmo link.'
            />
          )}
        </div>
      ) : null}
    </ProfileDrawerShell>
  );
}
