'use client';

import { CalendarDays, MapPin } from 'lucide-react';
import { useMemo } from 'react';
import { AboutSection } from '@/features/profile/AboutSection';
import type { SwipeableProfileMode } from '@/features/profile/contracts';
import {
  ProfileFeaturedCard,
  resolveFeaturedContent,
} from '@/features/profile/ProfileFeaturedCard';
import { ProfilePrimaryCTA } from '@/features/profile/ProfilePrimaryCTA';
import { extractVenmoUsername } from '@/features/profile/utils/venmo';
import VenmoPaySelector from '@/features/profile/VenmoPaySelector';
import type { AvailableDSP } from '@/lib/dsp';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { Artist, LegacySocialLink } from '@/types/db';
import type { PressPhoto } from '@/types/press-photos';

const PAY_AMOUNTS = [5, 10, 20];

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
  readonly pressPhotos?: readonly PressPhoto[];
  readonly allowPhotoDownloads?: boolean;
  readonly tourDates: TourDateViewModel[];
  readonly onSubscribeClick: () => void;
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
  tourDates,
  mergedDSPs,
  enableDynamicEngagement,
  onSubscribeClick,
}: {
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly latestRelease?: SwipeableModeContainerProps['latestRelease'];
  readonly tourDates: TourDateViewModel[];
  readonly mergedDSPs: AvailableDSP[];
  readonly enableDynamicEngagement?: boolean;
  readonly onSubscribeClick: () => void;
}) {
  const featuredContent = resolveFeaturedContent(tourDates, latestRelease);
  const shouldRenderLatestRelease =
    latestRelease && featuredContent.kind !== 'release';
  const shouldRenderFeaturedCard = featuredContent.kind !== 'fallback';

  return (
    <div className='space-y-4'>
      {shouldRenderFeaturedCard ? (
        <ProfileFeaturedCard
          artist={artist}
          latestRelease={latestRelease}
          tourDates={tourDates}
          dsps={mergedDSPs}
        />
      ) : null}

      <div className='mx-auto max-w-sm'>
        <ProfilePrimaryCTA
          artist={artist}
          socialLinks={socialLinks}
          mergedDSPs={mergedDSPs}
          enableDynamicEngagement={enableDynamicEngagement}
          showCapture={false}
        />
      </div>

      {shouldRenderLatestRelease ? (
        <div className='space-y-3'>
          <p className='text-xs font-semibold uppercase tracking-[0.14em] text-secondary-token'>
            Latest release
          </p>
          <ProfileFeaturedCard
            artist={artist}
            latestRelease={latestRelease}
            tourDates={[]}
            dsps={mergedDSPs}
          />
        </div>
      ) : null}

      <div className='pt-1'>
        <button
          type='button'
          onClick={onSubscribeClick}
          className='inline-flex h-11 w-full items-center justify-center rounded-xl border border-subtle bg-surface-1 text-sm font-semibold text-primary-token transition-[background-color,border-color,color] duration-normal hover:border-subtle hover:bg-surface-0'
        >
          Turn on alerts
        </button>
      </div>
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
        Payments not available for this artist yet.
      </div>
    );
  }

  return (
    <VenmoPaySelector
      venmoLink={venmoLink}
      venmoUsername={venmoUsername ?? undefined}
      amounts={PAY_AMOUNTS}
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
  pressPhotos = [],
  allowPhotoDownloads = false,
  tourDates,
  onSubscribeClick,
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
            inert={mode !== modes[activeIndex]}
            className='h-full min-w-full overflow-y-auto px-3 pb-5 pt-4'
            style={{ contentVisibility: 'auto' }}
          >
            {mode === 'profile' ? (
              <ProfilePane
                artist={artist}
                socialLinks={socialLinks}
                latestRelease={latestRelease}
                tourDates={tourDates}
                mergedDSPs={mergedDSPs}
                enableDynamicEngagement={enableDynamicEngagement}
                onSubscribeClick={onSubscribeClick}
              />
            ) : null}
            {mode === 'tour' ? (
              <TourPane artistName={artist.name} tourDates={tourDates} />
            ) : null}
            {mode === 'about' ? (
              <AboutSection
                artist={artist}
                genres={genres}
                pressPhotos={pressPhotos}
                allowPhotoDownloads={allowPhotoDownloads}
              />
            ) : null}
            {mode === 'pay' ? <TipPane socialLinks={socialLinks} /> : null}
          </section>
        ))}
      </div>
    </div>
  );
}
