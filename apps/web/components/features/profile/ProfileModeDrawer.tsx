'use client';

import { Bell, CalendarDays, Info, Mail, Music2, Ticket } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { TipSelector } from '@/components/molecules/TipSelector';
import {
  ArtistNotificationsCTA,
  TwoStepNotificationsCTA,
} from '@/features/profile/artist-notifications-cta';
import type { ProfileMode } from '@/features/profile/contracts';
import { ProfileContactDrawerContent } from '@/features/profile/ProfileContactDrawerContent';
import { ProfileDrawerShell } from '@/features/profile/ProfileDrawerShell';
import { TourDrawerContent } from '@/features/profile/TourModePanel';
import {
  extractVenmoUsername,
  isAllowedVenmoUrl,
} from '@/features/profile/utils/venmo';
import { track } from '@/lib/analytics';
import type { AvailableDSP } from '@/lib/dsp';
import type { PublicContact, PublicContactChannel } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import type { PressPhoto } from '@/types/press-photos';
import { AboutSection } from './AboutSection';
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
    subtitle: 'Profile details and press assets.',
    icon: Info,
  },
  contact: {
    title: 'Contact',
    subtitle: 'Booking, management, and press.',
    icon: Mail,
  },
  listen: {
    title: 'Listen',
    subtitle: 'Stream on your favorite platform.',
    icon: Music2,
  },
  subscribe: {
    title: 'Turn on notifications',
    subtitle: 'New releases and shows.',
    icon: Bell,
  },
  tip: {
    title: 'Pay',
    subtitle: 'Support in one tap',
    icon: Ticket,
  },
  tour: {
    title: 'Tour Dates',
    subtitle: 'Upcoming shows and tickets.',
    icon: CalendarDays,
  },
};

const TIP_AMOUNTS = [5, 10, 20];

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
      <p className='text-sm font-[590] text-white/88'>{title}</p>
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
  if (contacts.length === 0) {
    return (
      <ProfileModeFallback
        title='No contact options yet'
        description='This profile has not shared any public contact channels.'
      />
    );
  }

  return (
    <div
      className='rounded-[26px] border border-white/8 bg-white/[0.035] p-2 shadow-[0_14px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl'
      data-testid='profile-mode-drawer-contact'
    >
      <ProfileContactDrawerContent
        artistHandle={artistHandle}
        contacts={contacts}
        primaryChannel={primaryChannel}
      />
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
      case 'tip':
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
          <TourDrawerContent artist={artist} tourDates={tourDates} compact />
        </div>
      ) : null}

      {activeMode === 'tip' ? (
        <div data-testid='profile-mode-drawer-tip'>
          {hasValidVenmoLink ? (
            <TipSelector
              amounts={TIP_AMOUNTS}
              onContinue={handleTipAmountSelected}
              paymentLabel='Pay'
              showPaymentIcon={false}
            />
          ) : (
            <ProfileModeFallback
              title='Pay is not available yet'
              description='This profile has not added a public Venmo link.'
            />
          )}
        </div>
      ) : null}
    </ProfileDrawerShell>
  );
}
