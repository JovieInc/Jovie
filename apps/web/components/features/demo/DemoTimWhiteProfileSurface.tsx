'use client';

import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import {
  HOMEPAGE_PROFILE_PREVIEW_ARTIST,
  HOMEPAGE_PROFILE_PREVIEW_CONTACTS,
  HOMEPAGE_PROFILE_PREVIEW_RELEASES,
  HOMEPAGE_PROFILE_PREVIEW_SOCIAL_LINKS,
  HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES,
} from '@/features/home/homepage-profile-preview-fixture';
import type { ProfileMode } from '@/features/profile/contracts';
import { isProfileMode } from '@/features/profile/registry';
import {
  StaticArtistPage,
  type StaticArtistPageProps,
} from '@/features/profile/StaticArtistPage';
import { DemoClientProviders } from './DemoClientProviders';

const DEMO_PRESS_PHOTOS = [
  {
    id: 'press-photo-1',
    blobUrl: '/images/avatars/tim-white-founder.jpg',
    smallUrl: '/images/avatars/tim-white-founder.jpg',
    mediumUrl: '/images/avatars/tim-white-founder.jpg',
    largeUrl: '/images/avatars/tim-white-founder.jpg',
    originalFilename: 'tim-white-portrait.avif',
    width: 1200,
    height: 1500,
    status: 'ready',
    sortOrder: 0,
  },
  {
    id: 'press-photo-2',
    blobUrl: '/images/hero/tim-profile.avif',
    smallUrl: '/images/hero/tim-profile.avif',
    mediumUrl: '/images/hero/tim-profile.avif',
    largeUrl: '/images/hero/tim-profile.avif',
    originalFilename: 'tim-white-editorial.avif',
    width: 1200,
    height: 1500,
    status: 'ready',
    sortOrder: 1,
  },
  {
    id: 'press-photo-3',
    blobUrl: '/images/avatars/tim-white.jpg',
    smallUrl: '/images/avatars/tim-white.jpg',
    mediumUrl: '/images/avatars/tim-white.jpg',
    largeUrl: '/images/avatars/tim-white.jpg',
    originalFilename: 'tim-white-live.jpg',
    width: 1200,
    height: 1500,
    status: 'ready',
    sortOrder: 2,
  },
] as const;

type DemoRelease = NonNullable<StaticArtistPageProps['latestRelease']>;
type ReleaseVariant = 'presave' | 'live' | 'video';
type DemoReleaseVariant = {
  readonly title: string;
  readonly slug: string;
  readonly artworkUrl: string;
  readonly releaseDate: string;
  readonly revealDate?: string;
  readonly releaseType: string;
};

const TIMESTAMP = new Date('2026-01-01T00:00:00.000Z');
const RELEASE_VARIANT_KEYS = ['presave', 'live', 'video'] as const;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getReleaseVariants(
  nowMs: number
): Record<ReleaseVariant, DemoReleaseVariant> {
  return {
    presave: {
      title: HOMEPAGE_PROFILE_PREVIEW_RELEASES.presave.title,
      slug: HOMEPAGE_PROFILE_PREVIEW_RELEASES.presave.slug,
      artworkUrl: HOMEPAGE_PROFILE_PREVIEW_RELEASES.presave.artworkUrl,
      releaseDate: new Date(nowMs + 30 * MS_PER_DAY).toISOString(),
      revealDate: new Date(nowMs - 7 * MS_PER_DAY).toISOString(),
      releaseType: HOMEPAGE_PROFILE_PREVIEW_RELEASES.presave.releaseType,
    },
    live: {
      title: HOMEPAGE_PROFILE_PREVIEW_RELEASES.live.title,
      slug: HOMEPAGE_PROFILE_PREVIEW_RELEASES.live.slug,
      artworkUrl: HOMEPAGE_PROFILE_PREVIEW_RELEASES.live.artworkUrl,
      releaseDate: HOMEPAGE_PROFILE_PREVIEW_RELEASES.live.releaseDate,
      releaseType: HOMEPAGE_PROFILE_PREVIEW_RELEASES.live.releaseType,
    },
    video: {
      title: 'Never Say a Word',
      slug: 'never-say-a-word',
      artworkUrl: '/img/releases/never-say-a-word.jpg',
      releaseDate: '2025-08-15T07:00:00.000Z',
      releaseType: 'music_video',
    },
  };
}

function makeDemoRelease(base: DemoReleaseVariant): DemoRelease {
  return {
    id: `demo-${base.slug}`,
    creatorProfileId: 'demo-tim-white-profile',
    title: base.title,
    slug: base.slug,
    releaseType: base.releaseType,
    releaseDate: new Date(base.releaseDate),
    status: 'released',
    revealDate:
      'revealDate' in base ? new Date(base.revealDate as string) : null,
    deletedAt: null,
    label: null,
    upc: null,
    totalTracks: 1,
    isExplicit: false,
    genres: HOMEPAGE_PROFILE_PREVIEW_ARTIST.genres ?? null,
    targetPlaylists: null,
    copyrightLine: null,
    distributor: null,
    artworkUrl: base.artworkUrl,
    spotifyPopularity: null,
    sourceType: 'manual',
    metadata: {},
    generatedPitches: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  } as DemoRelease;
}

function isValidRelease(value: string | null): value is ReleaseVariant {
  return RELEASE_VARIANT_KEYS.includes(value as ReleaseVariant);
}

export function DemoTimWhiteProfileSurface() {
  const searchParams = useSearchParams();
  const modeParam = searchParams.get('mode');
  const releaseParam = searchParams.get('release');
  const captureMode = searchParams.get('capture');

  const mode: ProfileMode = isProfileMode(modeParam) ? modeParam : 'profile';
  const releaseKey: ReleaseVariant = isValidRelease(releaseParam)
    ? releaseParam
    : 'live';
  const releaseVariants = useMemo(() => getReleaseVariants(Date.now()), []);
  const latestRelease = makeDemoRelease(releaseVariants[releaseKey]);

  // For presave, omit tour dates so the countdown card renders instead
  const tourDates =
    releaseKey === 'presave' ? [] : [...HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES];
  const seededPressPhotos =
    captureMode === 'press-assets' ? [...DEMO_PRESS_PHOTOS] : [];

  if (captureMode === 'press-assets') {
    return (
      <DemoClientProviders>
        <div data-testid='demo-showcase-tim-white-profile'>
          <div className='flex min-h-screen items-center justify-center bg-[#0b0d12] px-5 py-10'>
            <div
              className='w-full max-w-[360px] rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,#12161f,#0b0e14)] p-4 shadow-[0_32px_100px_rgba(0,0,0,0.46)]'
              data-testid='demo-press-assets-capture'
            >
              <div className='rounded-[24px] border border-white/8 bg-white/[0.04] p-4'>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <p className='text-[12px] font-[560] text-white/50'>
                      About
                    </p>
                    <h2 className='mt-1 text-[20px] font-[600] tracking-[-0.03em] text-white'>
                      Share press photos
                    </h2>
                  </div>
                  <div className='rounded-[18px] border border-white/8 bg-[#10141c] p-2 shadow-[0_12px_40px_rgba(0,0,0,0.35)]'>
                    <div className='rounded-[12px] bg-white/[0.04] px-3 py-2 text-[12px] font-[560] text-white'>
                      Download press photos
                    </div>
                  </div>
                </div>

                <div className='mt-4 grid grid-cols-2 gap-3'>
                  {DEMO_PRESS_PHOTOS.slice(0, 2).map(photo => (
                    <div
                      key={photo.id}
                      className='overflow-hidden rounded-[18px] bg-white/[0.04]'
                    >
                      <div className='relative aspect-[4/5]'>
                        <Image
                          src={photo.mediumUrl}
                          alt={photo.originalFilename}
                          fill
                          sizes='160px'
                          className='object-cover'
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DemoClientProviders>
    );
  }

  return (
    <DemoClientProviders>
      <div data-testid='demo-showcase-tim-white-profile'>
        <StaticArtistPage
          presentation='compact-preview'
          mode={mode}
          artist={HOMEPAGE_PROFILE_PREVIEW_ARTIST}
          subtitle='Official artist profile'
          socialLinks={[...HOMEPAGE_PROFILE_PREVIEW_SOCIAL_LINKS]}
          contacts={[...HOMEPAGE_PROFILE_PREVIEW_CONTACTS]}
          pressPhotos={seededPressPhotos}
          allowPhotoDownloads={captureMode === 'press-assets'}
          tourDates={tourDates}
          latestRelease={latestRelease}
          genres={HOMEPAGE_PROFILE_PREVIEW_ARTIST.genres}
          showBackButton={false}
          showFooter
          showPayButton
          showTourButton
          showSubscriptionConfirmedBanner={false}
          profileSettings={{ showOldReleases: true }}
          hideJovieBranding
          hideMoreMenu
        />
      </div>
    </DemoClientProviders>
  );
}
