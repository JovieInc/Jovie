'use client';

import { CalendarDays, HandCoins, Mail, MapPin } from 'lucide-react';
import { type RefObject, useMemo, useState } from 'react';
import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { SocialLink } from '@/components/molecules/SocialLink';
import {
  ProfileFeaturedCard,
  resolveFeaturedContent,
} from '@/features/profile/ProfileFeaturedCard';
import { useTourDateTicketClick } from '@/hooks/useTourDateTicketClick';
import type { AvailableDSP } from '@/lib/dsp';
import { cn } from '@/lib/utils';
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
  readonly onSubscribeClick: () => void;
  readonly onTipClick: () => void;
  readonly onContactClick: () => void;
  readonly tourSectionRef: RefObject<HTMLElement | null>;
}

const condensedDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

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
    .map(genre => genre.trim())
    .filter(Boolean);
  const isLongBio = bio.length > 180 || bio.split('\n').length > 3;
  const hasContent = Boolean(bio || location || normalizedGenres.length > 0);

  if (!hasContent) {
    return null;
  }

  return (
    <section aria-labelledby='profile-about-heading'>
      <div className='rounded-[24px] border border-subtle bg-surface-1 px-5 py-4 shadow-sm'>
        <h2
          id='profile-about-heading'
          className='text-sm font-semibold tracking-tight text-primary-token'
        >
          About
        </h2>
        <div className='mt-3 space-y-3'>
          {bio ? (
            <div className='space-y-2'>
              <p
                className={cn(
                  'whitespace-pre-line text-sm leading-6 text-secondary-token',
                  !expanded && isLongBio && 'line-clamp-3'
                )}
              >
                {bio}
              </p>
              {isLongBio ? (
                <button
                  type='button'
                  className='text-sm font-semibold text-primary-token transition-opacity hover:opacity-75'
                  onClick={() => setExpanded(current => !current)}
                >
                  {expanded ? 'Show Less' : 'Read More'}
                </button>
              ) : null}
            </div>
          ) : null}

          {location || normalizedGenres.length > 0 ? (
            <div className='flex flex-wrap gap-2'>
              {location ? (
                <span className='inline-flex items-center gap-1.5 rounded-full border border-subtle bg-surface-0 px-3 py-1.5 text-xs font-medium text-secondary-token'>
                  <MapPin className='h-3.5 w-3.5' aria-hidden='true' />
                  {capitalizeFirst(location)}
                </span>
              ) : null}
              {normalizedGenres.map(genre => (
                <span
                  key={genre}
                  className='rounded-full border border-subtle bg-surface-0 px-3 py-1.5 text-xs font-medium text-secondary-token'
                >
                  {capitalizeFirst(genre)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
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
    <section aria-labelledby='profile-social-links-heading'>
      <h2 id='profile-social-links-heading' className='sr-only'>
        Social Links
      </h2>
      <div className='flex flex-wrap items-center gap-2'>
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

function TourDateCard({
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
    <article className='rounded-2xl border border-subtle bg-surface-0 p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 space-y-2'>
          <p className='text-sm font-semibold text-primary-token'>
            {tourDate.venueName || artistName}
          </p>
          <div className='flex flex-wrap items-center gap-3 text-xs text-secondary-token'>
            <span className='inline-flex items-center gap-1.5'>
              <CalendarDays className='h-3.5 w-3.5' aria-hidden='true' />
              {condensedDateFormatter.format(new Date(tourDate.startDate))}
            </span>
            {location ? (
              <span className='inline-flex items-center gap-1.5'>
                <MapPin className='h-3.5 w-3.5' aria-hidden='true' />
                {location}
              </span>
            ) : null}
          </div>
        </div>

        {tourDate.ticketUrl ? (
          <a
            href={tourDate.ticketUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90'
            onClick={handleTicketClick}
          >
            Tickets
          </a>
        ) : null}
      </div>
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

  const visibleDates = expanded ? sortedDates : sortedDates.slice(0, 3);

  return (
    <section ref={tourSectionRef} aria-labelledby='profile-tour-heading'>
      <div className='rounded-[24px] border border-subtle bg-surface-1 px-5 py-4 shadow-sm'>
        <div className='flex items-center justify-between gap-3'>
          <h2
            id='profile-tour-heading'
            className='text-sm font-semibold tracking-tight text-primary-token'
          >
            Tour Dates
          </h2>
          <p className='text-xs text-secondary-token'>
            {sortedDates.length} upcoming{' '}
            {sortedDates.length === 1 ? 'show' : 'shows'}
          </p>
        </div>

        <div className='mt-4 space-y-3'>
          {visibleDates.map(tourDate => (
            <TourDateCard
              key={tourDate.id}
              artistHandle={artist.handle}
              artistName={artist.name}
              tourDate={tourDate}
            />
          ))}
        </div>

        {sortedDates.length > 3 ? (
          <button
            type='button'
            className='mt-4 text-sm font-semibold text-primary-token transition-opacity hover:opacity-75'
            onClick={() => setExpanded(current => !current)}
          >
            {expanded
              ? 'Show Fewer Dates'
              : `Show All ${sortedDates.length} Dates`}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function ActionRow({
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
    <section aria-labelledby='profile-actions-heading'>
      <h2 id='profile-actions-heading' className='sr-only'>
        Actions
      </h2>
      <div
        className={cn(
          'grid gap-3',
          hasTip && hasContacts ? 'grid-cols-2' : 'grid-cols-1'
        )}
      >
        {hasTip ? (
          <button
            type='button'
            className='inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-subtle bg-surface-1 px-4 py-3 text-sm font-semibold text-primary-token shadow-sm transition-colors hover:bg-surface-0'
            onClick={onTipClick}
          >
            <HandCoins className='h-4 w-4' aria-hidden='true' />
            Tip
          </button>
        ) : null}
        {hasContacts ? (
          <button
            type='button'
            className='inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-subtle bg-surface-1 px-4 py-3 text-sm font-semibold text-primary-token shadow-sm transition-colors hover:bg-surface-0'
            onClick={onContactClick}
          >
            <Mail className='h-4 w-4' aria-hidden='true' />
            Contact
          </button>
        ) : null}
      </div>
    </section>
  );
}

function SubscribeSection({
  artistName,
  hasTourDates,
  onSubscribeClick,
}: {
  readonly artistName: string;
  readonly hasTourDates: boolean;
  readonly onSubscribeClick: () => void;
}) {
  return (
    <section aria-labelledby='profile-subscribe-heading'>
      <div className='rounded-[24px] border border-subtle bg-surface-1 px-5 py-4 shadow-sm'>
        <h2
          id='profile-subscribe-heading'
          className='text-sm font-semibold tracking-tight text-primary-token'
        >
          Get Notified
        </h2>
        <p className='mt-2 text-sm text-secondary-token'>
          {hasTourDates
            ? `Never miss a ${artistName} show.`
            : `Be first to hear new ${artistName} music.`}
        </p>
        <button
          type='button'
          className='mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90'
          onClick={onSubscribeClick}
        >
          Get Notified
        </button>
      </div>
    </section>
  );
}

function EmptyStateSection({ artistName }: { readonly artistName: string }) {
  return (
    <section aria-labelledby='profile-empty-state-heading'>
      <div className='rounded-[24px] border border-subtle bg-surface-1 px-5 py-4 shadow-sm'>
        <h2
          id='profile-empty-state-heading'
          className='text-sm font-semibold tracking-tight text-primary-token'
        >
          More Coming Soon
        </h2>
        <p className='mt-2 text-sm text-secondary-token'>
          {artistName} is just getting started here. Turn on notifications above
          to hear the next update first.
        </p>
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
  enableDynamicEngagement = false,
  genres,
  tourDates,
  hasTip,
  primaryActionKind,
  onSubscribeClick,
  onTipClick,
  onContactClick,
  tourSectionRef,
}: ProfileScrollBodyProps) {
  const featuredContent = resolveFeaturedContent(tourDates, latestRelease);
  const hasBioContent = Boolean(
    artist.tagline?.trim() ||
      artist.location?.trim() ||
      artist.hometown?.trim() ||
      (genres?.length ?? 0) > 0
  );
  const hasFeaturedContent = featuredContent.kind !== 'fallback';
  const hasTourDates = tourDates.length > 0;
  const hasContacts = contacts.length > 0;
  const showSubscribeSection = primaryActionKind !== 'subscribe';
  const hasBodyContent =
    hasBioContent ||
    socialLinks.length > 0 ||
    hasFeaturedContent ||
    hasTourDates ||
    hasTip ||
    hasContacts ||
    showSubscribeSection;

  return (
    <main className='flex-1 overflow-y-auto' aria-label='Artist profile'>
      <div className='space-y-4 px-4 pb-[max(env(safe-area-inset-bottom),20px)] pt-4'>
        <ArtistBioSection artist={artist} genres={genres} />
        <SocialLinksSection artist={artist} socialLinks={socialLinks} />

        {hasFeaturedContent ? (
          <section aria-labelledby='profile-featured-heading'>
            <h2 id='profile-featured-heading' className='sr-only'>
              Featured
            </h2>
            <ProfileFeaturedCard
              artist={artist}
              latestRelease={latestRelease}
              tourDates={tourDates}
              dsps={mergedDSPs}
              enableDynamicEngagement={enableDynamicEngagement}
            />
          </section>
        ) : null}

        <TourSection
          artist={artist}
          tourDates={tourDates}
          tourSectionRef={tourSectionRef}
        />

        <ActionRow
          hasTip={hasTip}
          hasContacts={hasContacts}
          onTipClick={onTipClick}
          onContactClick={onContactClick}
        />

        {showSubscribeSection ? (
          <SubscribeSection
            artistName={artist.name}
            hasTourDates={hasTourDates}
            onSubscribeClick={onSubscribeClick}
          />
        ) : null}

        {!hasBodyContent ? (
          <EmptyStateSection artistName={artist.name} />
        ) : null}
      </div>
    </main>
  );
}
