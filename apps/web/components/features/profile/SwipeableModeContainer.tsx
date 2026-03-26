'use client';

import { CalendarDays, MapPin } from 'lucide-react';
import { useMemo } from 'react';
import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { AboutSection } from '@/features/profile/AboutSection';
import type { SwipeableProfileMode } from '@/features/profile/contracts';
import { LatestReleaseCard } from '@/features/profile/LatestReleaseCard';
import { ProfilePrimaryCTA } from '@/features/profile/ProfilePrimaryCTA';
import { StaticListenInterface } from '@/features/profile/StaticListenInterface';
import { extractVenmoUsername } from '@/features/profile/utils/venmo';
import VenmoTipSelector from '@/features/profile/VenmoTipSelector';
import type { AvailableDSP } from '@/lib/dsp';
import type { Artist, LegacySocialLink } from '@/types/db';

const TIP_AMOUNTS = [3, 5, 7];

interface SwipeableModeContainerProps {
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly latestRelease?: {
    readonly title: string;
    readonly slug: string;
    readonly artworkUrl: string | null;
    readonly releaseDate: Date | string | null;
    readonly releaseType: string;
  } | null;
  readonly mergedDSPs: AvailableDSP[];
  readonly enableDynamicEngagement?: boolean;
  readonly genres?: string[] | null;
  readonly tourDates: TourDateViewModel[];
  readonly modes: readonly SwipeableProfileMode[];
  readonly activeIndex: number;
  readonly dragOffset: number;
  readonly isDragging: boolean;
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
  readonly handlers: {
    onTouchStart: (event: React.TouchEvent) => void;
    onTouchMove: (event: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
}

function ProfilePane({
  artist,
  socialLinks,
  latestRelease,
  mergedDSPs,
  enableDynamicEngagement,
}: {
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly latestRelease?: SwipeableModeContainerProps['latestRelease'];
  readonly mergedDSPs: AvailableDSP[];
  readonly enableDynamicEngagement?: boolean;
}) {
  return (
    <div className='space-y-4'>
      <div className='mx-auto max-w-xs'>
        <ProfilePrimaryCTA
          artist={artist}
          socialLinks={socialLinks}
          mergedDSPs={mergedDSPs}
          enableDynamicEngagement={enableDynamicEngagement}
          showCapture
        />
      </div>

      {latestRelease ? (
        <div className='space-y-3'>
          <p className='text-xs font-semibold uppercase tracking-[0.14em] text-secondary-token'>
            Latest release
          </p>
          <LatestReleaseCard
            release={latestRelease}
            artistHandle={artist.handle}
            artist={artist}
            dsps={mergedDSPs}
            enableDynamicEngagement={enableDynamicEngagement}
          />
        </div>
      ) : (
        <div className='rounded-2xl border border-subtle bg-surface-1 p-5 text-sm text-secondary-token shadow-sm'>
          New music and major updates will show up here first.
        </div>
      )}
    </div>
  );
}

function TourPane({
  artistName,
  tourDates,
}: {
  readonly artistName: string;
  readonly tourDates: TourDateViewModel[];
}) {
  const sortedDates = useMemo(
    () =>
      [...tourDates].sort(
        (a, b) =>
          new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      ),
    [tourDates]
  );

  if (sortedDates.length === 0) {
    return (
      <div className='rounded-2xl border border-subtle bg-surface-1 p-5 text-sm text-secondary-token shadow-sm'>
        No upcoming shows right now. Subscribe to hear about the next tour stop.
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      {sortedDates.map(tourDate => {
        const location = [tourDate.city, tourDate.region, tourDate.country]
          .filter(Boolean)
          .join(', ');

        return (
          <div
            key={tourDate.id}
            className='rounded-2xl border border-subtle bg-surface-1 p-4 shadow-sm'
          >
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <p className='text-sm font-semibold text-primary-token'>
                  {tourDate.venueName || artistName}
                </p>
                <div className='mt-2 flex flex-wrap items-center gap-3 text-xs text-secondary-token'>
                  <span className='inline-flex items-center gap-1.5'>
                    <CalendarDays className='h-3.5 w-3.5' aria-hidden='true' />
                    {new Intl.DateTimeFormat('en-US', {
                      month: 'short',
                      day: 'numeric',
                    }).format(new Date(tourDate.startDate))}
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
                  className='rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground'
                >
                  Tickets
                </a>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TipPane({
  socialLinks,
}: {
  readonly socialLinks: LegacySocialLink[];
}) {
  const venmoLink =
    socialLinks.find(link => link.platform === 'venmo')?.url ?? null;
  const venmoUsername = extractVenmoUsername(venmoLink);

  if (!venmoLink) {
    return (
      <div className='rounded-2xl border border-subtle bg-surface-1 p-5 text-sm text-secondary-token shadow-sm'>
        Tipping is not available for this artist yet.
      </div>
    );
  }

  return (
    <VenmoTipSelector
      venmoLink={venmoLink}
      venmoUsername={venmoUsername ?? undefined}
      amounts={TIP_AMOUNTS}
    />
  );
}

export function SwipeableModeContainer({
  artist,
  socialLinks,
  latestRelease,
  mergedDSPs,
  enableDynamicEngagement = false,
  genres,
  tourDates,
  modes,
  activeIndex,
  dragOffset,
  isDragging,
  containerRef,
  handlers,
}: SwipeableModeContainerProps) {
  const translate = `translateX(calc(-${activeIndex * 100}% + ${dragOffset}px))`;

  return (
    <div
      ref={containerRef}
      className='relative -mt-3 h-full overflow-hidden rounded-t-2xl'
      {...handlers}
    >
      <div
        className='flex h-full'
        style={{
          transform: translate,
          transition: isDragging
            ? 'none'
            : 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)',
          willChange: isDragging ? 'transform' : undefined,
        }}
      >
        {modes.map(mode => (
          <section
            key={mode}
            id={`profile-pane-${mode}`}
            role='tabpanel'
            aria-hidden={mode !== modes[activeIndex]}
            className='h-full min-w-full overflow-y-auto px-3 pb-4 pt-3'
            style={{ contentVisibility: 'auto' }}
          >
            {mode === 'profile' ? (
              <ProfilePane
                artist={artist}
                socialLinks={socialLinks}
                latestRelease={latestRelease}
                mergedDSPs={mergedDSPs}
                enableDynamicEngagement={enableDynamicEngagement}
              />
            ) : null}
            {mode === 'listen' ? (
              <div className='rounded-2xl border border-subtle bg-surface-1 p-4 shadow-sm'>
                <StaticListenInterface
                  artist={artist}
                  handle={artist.handle}
                  dspsOverride={mergedDSPs}
                  enableDynamicEngagement={enableDynamicEngagement}
                />
              </div>
            ) : null}
            {mode === 'tour' ? (
              <TourPane artistName={artist.name} tourDates={tourDates} />
            ) : null}
            {mode === 'about' ? (
              <AboutSection artist={artist} genres={genres} />
            ) : null}
            {mode === 'tip' ? <TipPane socialLinks={socialLinks} /> : null}
          </section>
        ))}
      </div>
    </div>
  );
}
