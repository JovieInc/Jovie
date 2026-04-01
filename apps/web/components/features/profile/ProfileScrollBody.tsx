'use client';

import { HandCoins, Mail, MapPin } from 'lucide-react';
import { type RefObject, useMemo, useState } from 'react';
import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { SocialLink } from '@/components/molecules/SocialLink';
import {
  ArtistNotificationsCTA,
  TwoStepNotificationsCTA,
} from '@/features/profile/artist-notifications-cta';
import { ProfileFeaturedCard } from '@/features/profile/ProfileFeaturedCard';
import { useTourDateTicketClick } from '@/hooks/useTourDateTicketClick';
import type { AvailableDSP } from '@/lib/dsp';
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

type PrimaryActionKind = 'tickets' | 'listen' | 'subscribe';

interface ProfileScrollBodyProps {
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly latestRelease?: ReleaseSummary | null;
  readonly mergedDSPs: AvailableDSP[];
  readonly enableDynamicEngagement?: boolean;
  readonly genres?: string[] | null;
  readonly tourDates: TourDateViewModel[];
  readonly hasTip: boolean;
  readonly primaryActionKind: PrimaryActionKind;
  readonly subscribeTwoStep?: boolean;
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
    <p className='text-[0.72rem] font-[590] uppercase tracking-[0.18em] text-secondary-token'>
      {children}
    </p>
  );
}

function ArtistBioSection({
  artist,
  genres,
}: {
  readonly artist: Artist;
  readonly genres?: string[] | null;
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
  const isLongBio = bio.length > 190 || bio.split('\n').length > 3;

  if (!bio && !metaLine) {
    return null;
  }

  return (
    <section aria-labelledby='profile-about-heading' className='space-y-3'>
      <SectionLabel>About</SectionLabel>

      {bio ? (
        <div className='rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] px-5 py-4 shadow-[0_16px_50px_rgba(0,0,0,0.12)]'>
          {metaLine ? (
            <div className='mb-3 inline-flex max-w-full items-center gap-2 rounded-full border border-white/8 bg-black/10 px-3 py-1.5 text-[0.78rem] text-secondary-token'>
              <MapPin className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
              <span className='truncate'>{metaLine}</span>
            </div>
          ) : null}
          <p
            id='profile-about-heading'
            className={`whitespace-pre-line text-[0.95rem] leading-7 text-secondary-token ${!expanded && isLongBio ? 'line-clamp-4' : ''}`}
          >
            {bio}
          </p>
          {isLongBio ? (
            <button
              type='button'
              className='mt-3 text-sm font-[590] text-primary-token transition-opacity hover:opacity-75'
              onClick={() => setExpanded(current => !current)}
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          ) : null}
        </div>
      ) : (
        <div
          id='profile-about-heading'
          className='inline-flex max-w-full items-center gap-2 rounded-full border border-white/8 bg-white/[0.05] px-3 py-2 text-[0.82rem] text-secondary-token'
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
      <SectionLabel>Elsewhere</SectionLabel>
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

  return (
    <article className='grid gap-4 border-t border-white/8 py-4 first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-center'>
      <div className='flex h-[64px] w-[64px] flex-col items-center justify-center rounded-[20px] border border-white/8 bg-black/10 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'>
        <span className='text-[0.68rem] font-[590] uppercase tracking-[0.18em] text-secondary-token'>
          {new Intl.DateTimeFormat('en-US', { month: 'short' }).format(
            new Date(tourDate.startDate)
          )}
        </span>
        <span className='mt-1 text-[1.4rem] font-[680] tracking-[-0.06em] text-primary-token'>
          {new Intl.DateTimeFormat('en-US', { day: 'numeric' }).format(
            new Date(tourDate.startDate)
          )}
        </span>
      </div>

      <div className='min-w-0'>
        <p className='truncate text-base font-[590] text-primary-token'>
          {tourDate.venueName || artistName}
        </p>
        <p className='mt-1 text-sm text-secondary-token'>
          {condensedDateFormatter.format(new Date(tourDate.startDate))}
        </p>
        {location ? (
          <p className='truncate text-sm text-tertiary-token'>{location}</p>
        ) : null}
      </div>

      {tourDate.ticketUrl ? (
        <a
          href={tourDate.ticketUrl}
          target='_blank'
          rel='noopener noreferrer'
          className='inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/6 px-4 py-2.5 text-sm font-[590] text-primary-token transition-[background-color,border-color] hover:border-white/18 hover:bg-white/10'
          onClick={handleTicketClick}
        >
          Tickets
        </a>
      ) : null}
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
  const sortedDates = useMemo(
    () =>
      [...tourDates].sort(
        (a, b) =>
          new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      ),
    [tourDates]
  );

  if (sortedDates.length === 0) {
    return null;
  }

  const visibleDates = expanded ? sortedDates : sortedDates.slice(0, 4);

  return (
    <section
      ref={tourSectionRef}
      aria-labelledby='profile-tour-heading'
      className='space-y-3'
    >
      <SectionLabel>Tour</SectionLabel>
      <div
        id='profile-tour-heading'
        className='rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] px-5 py-4 shadow-[0_16px_50px_rgba(0,0,0,0.12)]'
      >
        {visibleDates.map(tourDate => (
          <TourDateRow
            key={tourDate.id}
            artistHandle={artist.handle}
            artistName={artist.name}
            tourDate={tourDate}
          />
        ))}

        {sortedDates.length > 4 ? (
          <button
            type='button'
            className='mt-5 text-sm font-[590] text-primary-token transition-opacity hover:opacity-75'
            onClick={() => setExpanded(current => !current)}
          >
            {expanded
              ? 'Show fewer dates'
              : `Show all ${sortedDates.length} dates`}
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
            className='inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-2.5 text-sm font-[590] text-primary-token transition-[background-color,border-color] hover:border-white/18 hover:bg-white/10'
            onClick={onContactClick}
          >
            <Mail className='h-4 w-4' aria-hidden='true' />
            Contact
          </button>
        ) : null}
        {hasTip ? (
          <button
            type='button'
            className='inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-2.5 text-sm font-[590] text-primary-token transition-[background-color,border-color] hover:border-white/18 hover:bg-white/10'
            onClick={onTipClick}
          >
            <HandCoins className='h-4 w-4' aria-hidden='true' />
            Tip
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
    >
      <SectionLabel>Get Notified</SectionLabel>
      <div
        id='profile-subscribe-heading'
        className='rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] px-5 py-4 shadow-[0_16px_50px_rgba(0,0,0,0.12)]'
      >
        {subscribeTwoStep ? (
          <TwoStepNotificationsCTA artist={artist} />
        ) : (
          <ArtistNotificationsCTA
            key={subscribeModeActive ? 'subscribe-focus' : 'subscribe-default'}
            artist={artist}
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
      <div className='space-y-7 px-5 pb-[max(env(safe-area-inset-bottom),28px)] pt-6 md:space-y-8 md:px-7 md:pb-8 md:pt-7'>
        <SubscribeSection
          artist={artist}
          subscribeTwoStep={subscribeTwoStep}
          subscribeSectionRef={subscribeSectionRef}
          subscribeModeActive={subscribeModeActive}
        />

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
                tourDates={[]}
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

        <UtilityRail
          hasTip={hasTip}
          hasContacts={hasContacts}
          onTipClick={onTipClick}
          onContactClick={onContactClick}
        />

        <ArtistBioSection artist={artist} genres={genres} />
        <SocialLinksSection artist={artist} socialLinks={socialLinks} />
      </div>
    </main>
  );
}
