'use client';

import { HandCoins, Mail, MapPin } from 'lucide-react';
import { type RefObject, useState } from 'react';
import { SocialLink } from '@/components/molecules/SocialLink';
import {
  ArtistNotificationsCTA,
  TwoStepNotificationsCTA,
} from '@/features/profile/artist-notifications-cta';
import {
  profilePrimaryPillClassName,
  profileSecondaryPillClassName,
} from '@/features/profile/artist-notifications-cta/shared';
import { ProfileFeaturedCard } from '@/features/profile/ProfileFeaturedCard';
import { useTourDateTicketClick } from '@/hooks/useTourDateTicketClick';
import type { AvailableDSP } from '@/lib/dsp';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { capitalizeFirst } from '@/lib/utils/string-utils';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';

type ReleaseSummary = {
  readonly title: string;
  readonly slug: string;
  readonly artworkUrl: string | null;
  readonly releaseDate: Date | string | null;
  readonly releaseType: string;
};

interface ProfileScrollBodyProps {
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly latestRelease?: ReleaseSummary | null;
  readonly mergedDSPs: AvailableDSP[];
  readonly genres?: string[] | null;
  readonly tourDates: TourDateViewModel[];
  readonly hasTip: boolean;
  readonly subscribeTwoStep?: boolean;
  readonly aboutSectionRef: RefObject<HTMLElement | null>;
  readonly subscribeSectionRef: RefObject<HTMLElement | null>;
  readonly subscribeModeActive?: boolean;
  readonly onTipClick: () => void;
  readonly onContactClick: () => void;
  readonly tourSectionRef: RefObject<HTMLElement | null>;
}

const condensedDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

function SectionLabel({ children }: { readonly children: React.ReactNode }) {
  return (
    <p className='text-app font-semibold tracking-[-0.015em] text-secondary-token'>
      {children}
    </p>
  );
}

const panelClassName =
  'rounded-[var(--profile-card-radius)] border border-[color:var(--profile-panel-border)] bg-[var(--profile-content-bg)] px-5 py-5 shadow-[var(--profile-panel-shadow)] backdrop-blur-2xl';
const flatSurfaceClassName =
  'rounded-[var(--profile-inner-radius)] border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg)] shadow-[var(--profile-pearl-shadow)] backdrop-blur-xl';
const profileActionPrimaryClassName = `${profilePrimaryPillClassName} min-h-11 px-4 py-2.5`;
const profileActionSecondaryClassName = `${profileSecondaryPillClassName} min-h-11 px-4 py-2.5`;

function ArtistBioSection({
  artist,
  genres,
  aboutSectionRef,
}: {
  readonly artist: Artist;
  readonly genres?: string[] | null;
  readonly aboutSectionRef: RefObject<HTMLElement | null>;
}) {
  const [expanded, setExpanded] = useState(false);
  const bio = artist.tagline?.trim() ?? '';
  const location = artist.location?.trim() || artist.hometown?.trim() || '';
  const normalizedGenres = (genres ?? [])
    .map(genre => capitalizeFirst(genre.trim()))
    .filter(Boolean)
    .slice(0, 3);
  const metaLine = [location, normalizedGenres.join(' · ')]
    .filter(Boolean)
    .join(' / ');
  const isLongBio = bio.length > 300 || bio.split('\n').length > 5;

  if (!bio && !metaLine) {
    return null;
  }

  return (
    <section
      ref={aboutSectionRef}
      aria-labelledby='profile-about-heading'
      className='space-y-3'
    >
      <SectionLabel>About</SectionLabel>

      {bio ? (
        <div className={panelClassName}>
          {metaLine ? (
            <div className='mb-3 inline-flex max-w-full items-center gap-2 rounded-full border border-subtle/70 bg-surface-2/80 px-3 py-1.5 text-[0.78rem] text-secondary-token'>
              <MapPin className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
              <span className='truncate'>{metaLine}</span>
            </div>
          ) : null}
          <p
            id='profile-about-heading'
            className={`whitespace-pre-line text-[0.95rem] leading-7 text-secondary-token ${!expanded && isLongBio ? 'line-clamp-6' : ''}`}
          >
            {bio}
          </p>
          {isLongBio ? (
            <button
              type='button'
              className='mt-3 text-sm font-semibold text-primary-token transition-opacity hover:opacity-75'
              onClick={() => setExpanded(current => !current)}
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          ) : null}
        </div>
      ) : (
        <div
          id='profile-about-heading'
          className='inline-flex max-w-full items-center gap-2 rounded-full border border-subtle/70 bg-surface-1/75 px-3 py-2 text-[0.82rem] text-secondary-token'
        >
          <MapPin className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
          <span className='truncate'>{metaLine}</span>
        </div>
      )}
    </section>
  );
}

function SocialLinksSection({
  artist,
  socialLinks,
}: {
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
}) {
  if (socialLinks.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby='profile-social-links-heading'
      className='space-y-3'
    >
      <SectionLabel>Follow</SectionLabel>
      <div
        id='profile-social-links-heading'
        className='flex flex-wrap items-center gap-2.5'
      >
        {socialLinks.map(link => (
          <SocialLink
            key={link.id}
            link={link}
            handle={artist.handle}
            artistName={artist.name}
          />
        ))}
      </div>
    </section>
  );
}

function TourDateRow({
  artistHandle,
  artistName,
  tourDate,
}: {
  readonly artistHandle: string;
  readonly artistName: string;
  readonly tourDate: TourDateViewModel;
}) {
  const handleTicketClick = useTourDateTicketClick(
    artistHandle,
    tourDate.id,
    tourDate.ticketUrl
  );
  const location = [tourDate.city, tourDate.region, tourDate.country]
    .filter(Boolean)
    .join(', ');
  const canBuyTickets =
    Boolean(tourDate.ticketUrl) &&
    tourDate.ticketStatus !== 'cancelled' &&
    tourDate.ticketStatus !== 'sold_out';

  return (
    <article
      className={`${flatSurfaceClassName} grid gap-4 px-4 py-4 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-center`}
    >
      <div className='flex h-[64px] w-[64px] flex-col items-center justify-center rounded-[var(--profile-drawer-radius-desktop)] border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg-active)] text-center shadow-[var(--profile-pearl-shadow)] backdrop-blur-xl'>
        <span className='text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-secondary-token'>
          {new Intl.DateTimeFormat('en-US', { month: 'short' }).format(
            new Date(tourDate.startDate)
          )}
        </span>
        <span className='mt-1 text-[1.4rem] font-bold tracking-[-0.06em] text-primary-token'>
          {new Intl.DateTimeFormat('en-US', { day: 'numeric' }).format(
            new Date(tourDate.startDate)
          )}
        </span>
      </div>

      <div className='min-w-0'>
        <p className='truncate text-base font-semibold text-primary-token'>
          {tourDate.venueName || artistName}
        </p>
        <p className='mt-1 text-sm text-secondary-token'>
          {condensedDateFormatter.format(new Date(tourDate.startDate))}
        </p>
        {location ? (
          <p className='truncate text-sm text-tertiary-token'>{location}</p>
        ) : null}
      </div>

      {canBuyTickets ? (
        <a
          href={tourDate.ticketUrl as string}
          target='_blank'
          rel='noopener noreferrer'
          className={profileActionPrimaryClassName}
          onClick={handleTicketClick}
        >
          Tickets
        </a>
      ) : (
        <span
          className={`${profileActionSecondaryClassName} text-tertiary-token`}
        >
          {tourDate.ticketStatus === 'sold_out' ? 'Sold out' : 'No tickets'}
        </span>
      )}
    </article>
  );
}

function TourSection({
  artist,
  tourDates,
  tourSectionRef,
}: {
  readonly artist: Artist;
  readonly tourDates: TourDateViewModel[];
  readonly tourSectionRef: RefObject<HTMLElement | null>;
}) {
  const [expanded, setExpanded] = useState(false);

  if (tourDates.length === 0) {
    return null;
  }

  // Tour dates are pre-sorted server-side by startDate ascending
  const visibleDates = expanded ? tourDates : tourDates.slice(0, 4);

  return (
    <section
      ref={tourSectionRef}
      aria-labelledby='profile-tour-heading'
      className='space-y-3'
    >
      <SectionLabel>Tour</SectionLabel>
      <div id='profile-tour-heading' className='space-y-3'>
        {visibleDates.map(tourDate => (
          <TourDateRow
            key={tourDate.id}
            artistHandle={artist.handle}
            artistName={artist.name}
            tourDate={tourDate}
          />
        ))}

        {tourDates.length > 4 ? (
          <button
            type='button'
            className={profileActionSecondaryClassName}
            onClick={() => setExpanded(current => !current)}
          >
            {expanded
              ? 'Show fewer dates'
              : `Show all ${tourDates.length} dates`}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function UtilityRail({
  hasTip,
  hasContacts,
  onTipClick,
  onContactClick,
}: {
  readonly hasTip: boolean;
  readonly hasContacts: boolean;
  readonly onTipClick: () => void;
  readonly onContactClick: () => void;
}) {
  if (!hasTip && !hasContacts) {
    return null;
  }

  return (
    <section aria-labelledby='profile-actions-heading' className='space-y-3'>
      <SectionLabel>Connect</SectionLabel>
      <div id='profile-actions-heading' className='flex flex-wrap gap-3'>
        {hasContacts ? (
          <button
            type='button'
            className={`${profileActionSecondaryClassName} gap-2`}
            onClick={onContactClick}
          >
            <Mail className='h-4 w-4' aria-hidden='true' />
            Contact
          </button>
        ) : null}
        {hasTip ? (
          <button
            type='button'
            className={`${profileActionSecondaryClassName} gap-2`}
            onClick={onTipClick}
          >
            <HandCoins className='h-4 w-4' aria-hidden='true' />
            Pay
          </button>
        ) : null}
      </div>
    </section>
  );
}

function SubscribeSection({
  artist,
  subscribeTwoStep = false,
  subscribeSectionRef,
  subscribeModeActive = false,
}: {
  readonly artist: Artist;
  readonly subscribeTwoStep?: boolean;
  readonly subscribeSectionRef: RefObject<HTMLElement | null>;
  readonly subscribeModeActive?: boolean;
}) {
  return (
    <section
      ref={subscribeSectionRef}
      aria-labelledby='profile-subscribe-heading'
      className='space-y-3'
      data-testid='subscribe-cta-container'
    >
      <SectionLabel>Get Notified</SectionLabel>
      <div id='profile-subscribe-heading' className={panelClassName}>
        {subscribeTwoStep ? (
          <TwoStepNotificationsCTA
            artist={artist}
            startExpanded={subscribeModeActive}
            presentation='overlay'
          />
        ) : (
          <ArtistNotificationsCTA
            key={subscribeModeActive ? 'subscribe-focus' : 'subscribe-default'}
            artist={artist}
            presentation='overlay'
            variant='button'
            autoOpen={true}
            forceExpanded={true}
            hideListenFallback={true}
          />
        )}
      </div>
    </section>
  );
}

export function ProfileScrollBody({
  artist,
  socialLinks,
  contacts,
  latestRelease,
  mergedDSPs,
  genres,
  tourDates,
  hasTip,
  subscribeTwoStep = false,
  aboutSectionRef,
  subscribeSectionRef,
  subscribeModeActive = false,
  onTipClick,
  onContactClick,
  tourSectionRef,
}: ProfileScrollBodyProps) {
  const hasContacts = contacts.length > 0;

  return (
    <main
      className='min-h-0 flex-1 overflow-y-auto'
      aria-label='Artist profile'
    >
      <div
        className={`px-5 pb-[max(env(safe-area-inset-bottom),28px)] md:px-7 md:pb-8 ${
          subscribeModeActive
            ? 'space-y-6 pt-4 md:space-y-7 md:pt-6'
            : 'space-y-7 pt-6 md:space-y-8 md:pt-7'
        }`}
      >
        {/* Section order: Featured → Tour → Subscribe → Connect → About → Follow */}

        {latestRelease ? (
          <section
            aria-labelledby='profile-featured-heading'
            className='space-y-3'
          >
            <SectionLabel>Latest Release</SectionLabel>
            <div id='profile-featured-heading'>
              <ProfileFeaturedCard
                artist={artist}
                latestRelease={latestRelease}
                tourDates={tourDates}
                dsps={mergedDSPs}
              />
            </div>
          </section>
        ) : null}

        <TourSection
          artist={artist}
          tourDates={tourDates}
          tourSectionRef={tourSectionRef}
        />

        <SubscribeSection
          artist={artist}
          subscribeTwoStep={subscribeTwoStep}
          subscribeSectionRef={subscribeSectionRef}
          subscribeModeActive={subscribeModeActive}
        />

        <UtilityRail
          hasTip={hasTip}
          hasContacts={hasContacts}
          onTipClick={onTipClick}
          onContactClick={onContactClick}
        />

        <ArtistBioSection
          artist={artist}
          genres={genres}
          aboutSectionRef={aboutSectionRef}
        />
        <SocialLinksSection artist={artist} socialLinks={socialLinks} />
      </div>
    </main>
  );
}
