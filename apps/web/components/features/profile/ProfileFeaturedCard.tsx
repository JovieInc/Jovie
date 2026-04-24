import { CalendarDays, MapPin, Play, Ticket } from 'lucide-react';
import Link from 'next/link';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import type { AvailableDSP } from '@/lib/dsp';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
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
}

export function ProfileFeaturedCard({
  artist,
  latestRelease,
  tourDates,
  dsps,
}: ProfileFeaturedCardProps) {
  const featuredContent = resolveFeaturedContent(tourDates, latestRelease);

  if (featuredContent.kind === 'release') {
    const releaseYear = featuredContent.release.releaseDate
      ? new Date(featuredContent.release.releaseDate).getUTCFullYear()
      : null;
    const releaseTypeLabel =
      featuredContent.release.releaseType === 'ep'
        ? 'EP'
        : featuredContent.release.releaseType.charAt(0).toUpperCase() +
          featuredContent.release.releaseType.slice(1);

    return (
      <section className='overflow-hidden rounded-[var(--profile-card-radius)] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] shadow-[0_24px_70px_rgba(0,0,0,0.16)]'>
        <div className='grid gap-5 p-4 sm:grid-cols-[112px_minmax(0,1fr)] sm:items-center sm:p-5'>
          <div className='relative aspect-square overflow-hidden rounded-[var(--radius-3xl)] border border-white/10 bg-surface-2 shadow-[0_20px_35px_rgba(0,0,0,0.18)]'>
            <ImageWithFallback
              src={featuredContent.release.artworkUrl}
              alt={`${featuredContent.release.title} artwork`}
              fill
              sizes='(max-width: 640px) 100vw, 112px'
              className='object-cover'
              fallbackVariant='release'
            />
          </div>

          <div className='min-w-0'>
            <p className='text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-secondary-token'>
              Featured release
            </p>
            <h2 className='mt-2 text-[1.55rem] font-semibold tracking-[-0.04em] text-primary-token'>
              {featuredContent.release.title}
            </h2>
            <p className='mt-2 text-sm text-secondary-token'>
              {releaseTypeLabel}
              {releaseYear ? ` · ${releaseYear}` : ''}
              {dsps.length > 0 ? ` · ${dsps.length} platforms` : ''}
            </p>
            <div className='mt-5 flex flex-wrap gap-3'>
              <Link
                href={`/${artist.handle}/${featuredContent.release.slug}`}
                prefetch={false}
                className='inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90'
                aria-label={`Open ${featuredContent.release.title}`}
              >
                <Play
                  className='mr-2 h-4 w-4 fill-current'
                  aria-hidden='true'
                />
                Listen now
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (featuredContent.kind === 'tour') {
    const { tourDate } = featuredContent;
    const location = [tourDate.city, tourDate.region, tourDate.country]
      .filter(Boolean)
      .join(', ');

    return (
      <section className='overflow-hidden rounded-[var(--profile-card-radius)] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_24px_70px_rgba(0,0,0,0.16)]'>
        <div className='grid gap-5 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-5'>
          <div className='flex h-[92px] w-[92px] shrink-0 flex-col items-center justify-center rounded-[var(--profile-drawer-radius-mobile)] border border-white/10 bg-black/15 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'>
            <span className='text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-secondary-token'>
              {new Intl.DateTimeFormat('en-US', { month: 'short' }).format(
                new Date(tourDate.startDate)
              )}
            </span>
            <span className='mt-1 text-[2rem] font-bold tracking-[-0.06em] text-primary-token'>
              {new Intl.DateTimeFormat('en-US', { day: 'numeric' }).format(
                new Date(tourDate.startDate)
              )}
            </span>
          </div>

          <div className='space-y-3'>
            <div className='inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-secondary-token'>
              <CalendarDays className='h-3.5 w-3.5' aria-hidden='true' />
              Upcoming show
            </div>
            <div className='space-y-1'>
              <h2 className='text-[1.45rem] font-semibold tracking-[-0.04em] text-primary-token'>
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
              className='inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90'
            >
              <Ticket className='mr-2 h-4 w-4' aria-hidden='true' />
              Get tickets
            </a>
          ) : null}
        </div>
      </section>
    );
  }

  return null;
}
