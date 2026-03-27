'use client';

import { CalendarDays, MapPin } from 'lucide-react';
import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { LatestReleaseCard } from '@/features/profile/LatestReleaseCard';
import type { AvailableDSP } from '@/lib/dsp';
import type { Artist } from '@/types/db';

type ReleaseSummary = {
  readonly title: string;
  readonly slug: string;
  readonly artworkUrl: string | null;
  readonly releaseDate: Date | string | null;
  readonly releaseType: string;
};

type FeaturedContent =
  | { kind: 'tour'; tourDate: TourDateViewModel }
  | { kind: 'release'; release: ReleaseSummary }
  | { kind: 'fallback' };

export function resolveFeaturedContent(
  tourDates: readonly TourDateViewModel[],
  latestRelease?: ReleaseSummary | null,
  now = new Date()
): FeaturedContent {
  const nextTourDate = [...tourDates]
    .filter(tourDate => new Date(tourDate.startDate).getTime() >= now.getTime())
    .sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    )[0];

  if (nextTourDate) {
    return { kind: 'tour', tourDate: nextTourDate };
  }

  if (latestRelease) {
    return { kind: 'release', release: latestRelease };
  }

  return { kind: 'fallback' };
}

interface ProfileFeaturedCardProps {
  readonly artist: Artist;
  readonly latestRelease?: ReleaseSummary | null;
  readonly tourDates: readonly TourDateViewModel[];
  readonly dsps: AvailableDSP[];
  readonly enableDynamicEngagement?: boolean;
}

export function ProfileFeaturedCard({
  artist,
  latestRelease,
  tourDates,
  dsps,
  enableDynamicEngagement = false,
}: ProfileFeaturedCardProps) {
  const featuredContent = resolveFeaturedContent(tourDates, latestRelease);

  if (featuredContent.kind === 'release') {
    return (
      <div className='space-y-3'>
        <p className='text-[11px] font-semibold uppercase tracking-[0.18em] text-secondary-token'>
          Featured now
        </p>
        <LatestReleaseCard
          release={featuredContent.release}
          artistHandle={artist.handle}
          artist={artist}
          dsps={dsps}
          enableDynamicEngagement={enableDynamicEngagement}
        />
      </div>
    );
  }

  if (featuredContent.kind === 'tour') {
    const { tourDate } = featuredContent;
    const location = [tourDate.city, tourDate.region, tourDate.country]
      .filter(Boolean)
      .join(', ');

    return (
      <section className='rounded-[24px] border border-subtle bg-surface-1 px-5 py-4 shadow-sm'>
        <div className='flex items-start justify-between gap-4'>
          <div className='space-y-3'>
            <div className='inline-flex items-center gap-2 rounded-full border border-subtle/80 bg-surface-0 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-secondary-token'>
              <CalendarDays className='h-3.5 w-3.5' aria-hidden='true' />
              Upcoming show
            </div>
            <div className='space-y-1'>
              <h2 className='text-lg font-[590] tracking-tight text-primary-token'>
                {tourDate.venueName || artist.name}
              </h2>
              <p className='text-sm text-secondary-token'>
                {new Intl.DateTimeFormat('en-US', {
                  month: 'long',
                  day: 'numeric',
                }).format(new Date(tourDate.startDate))}
              </p>
              {location ? (
                <p className='inline-flex items-center gap-1.5 text-sm text-tertiary-token'>
                  <MapPin className='h-3.5 w-3.5' aria-hidden='true' />
                  {location}
                </p>
              ) : null}
            </div>
          </div>
          {tourDate.ticketUrl ? (
            <a
              href={tourDate.ticketUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex shrink-0 items-center justify-center rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90'
            >
              Tickets
            </a>
          ) : null}
        </div>
      </section>
    );
  }

  return null;
}
