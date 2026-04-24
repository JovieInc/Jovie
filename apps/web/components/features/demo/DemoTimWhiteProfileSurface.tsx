'use client';

import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { HomeProfileShowcase } from '@/features/home/HomeProfileShowcase';
import {
  HOMEPAGE_PROFILE_PREVIEW_ARTIST,
  HOMEPAGE_PROFILE_PREVIEW_CONTACTS,
  HOMEPAGE_PROFILE_PREVIEW_PLAYLIST_FALLBACK,
  HOMEPAGE_PROFILE_PREVIEW_RELEASES,
  HOMEPAGE_PROFILE_PREVIEW_SOCIAL_LINKS,
  HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES,
} from '@/features/home/homepage-profile-preview-fixture';
import {
  type ProfileMode,
  type ProfileShowcaseStateId,
} from '@/features/profile/contracts';
import {
  ProfilePrimaryActionCard,
  type ProfilePrimaryActionCardRelease,
} from '@/features/profile/ProfilePrimaryActionCard';
import { isProfileMode } from '@/features/profile/registry';
import {
  StaticArtistPage,
  type StaticArtistPageProps,
} from '@/features/profile/StaticArtistPage';
import type { UserLocation } from '@/hooks/useUserLocation';
import type { ConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
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
const SHOWCASE_VIEWER_LOCATION = {
  latitude: 34.0522,
  longitude: -118.2437,
} as const;
const SHOWCASE_NOW = new Date('2026-04-20T12:00:00.000Z');
const DEMO_TIM_WHITE_SHOWCASE_MODES = ['cards', 'subscribe'] as const;
const DEMO_TIM_WHITE_SHOWCASE_STATE_IDS = [
  'mock-home',
  'streams-latest',
  'streams-presave',
  'streams-release-day',
  'streams-video',
  'tour-nearby',
  'playlist-fallback',
  'listen-fallback',
  'fans-opt-in',
  'fans-confirmed',
  'fans-song-alert',
  'fans-show-alert',
  'subscribe-email',
  'subscribe-otp',
  'subscribe-otp-error',
  'subscribe-name',
  'subscribe-birthday',
  'subscribe-done',
  'tips-open',
  'tips-apple-pay',
  'tips-thank-you',
  'tips-followup',
  'tour',
  'contact',
  'catalog',
] as const satisfies readonly ProfileShowcaseStateId[];
const SUBSCRIBE_SHOWCASE_STATE_IDS = [
  'fans-opt-in',
  'subscribe-email',
  'subscribe-otp',
  'subscribe-otp-error',
  'subscribe-name',
  'subscribe-birthday',
  'subscribe-done',
] as const satisfies readonly ProfileShowcaseStateId[];
const SHOWCASE_PROFILE_SETTINGS = { showOldReleases: true } as const;
const SHOWCASE_ACTION_CARD_CLASS_NAME = 'w-full';

type DemoTimWhiteShowcaseMode = (typeof DEMO_TIM_WHITE_SHOWCASE_MODES)[number];
type ActionCardPreviewConfig = {
  readonly dataTestId: string;
  readonly latestRelease?: ProfilePrimaryActionCardRelease | null;
  readonly featuredPlaylistFallback?: ConfirmedFeaturedPlaylistFallback | null;
  readonly tourDates: readonly TourDateViewModel[];
  readonly hasPlayableDestinations: boolean;
  readonly previewActionLabel?: string;
  readonly viewerLocation?: UserLocation | null;
  readonly resolveNearbyTour?: boolean;
};

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

function isDemoTimWhiteShowcaseMode(
  value: string | null
): value is DemoTimWhiteShowcaseMode {
  return DEMO_TIM_WHITE_SHOWCASE_MODES.includes(
    value as DemoTimWhiteShowcaseMode
  );
}

function isProfileShowcaseStateId(
  value: string | null
): value is ProfileShowcaseStateId {
  return DEMO_TIM_WHITE_SHOWCASE_STATE_IDS.includes(
    value as ProfileShowcaseStateId
  );
}

function DemoShowcaseShell({
  title,
  subtitle,
  testId,
  children,
}: Readonly<{
  title: string;
  subtitle: string;
  testId: string;
  children: React.ReactNode;
}>) {
  return (
    <DemoClientProviders>
      <div data-testid={testId}>
        <div className='min-h-screen bg-[#05070b] px-5 py-8 text-white sm:px-6 lg:px-8'>
          <div className='mx-auto max-w-[1200px]'>
            <div className='max-w-[42rem]'>
              <p className='text-[11px] font-[600] tracking-[0.14em] text-white/42'>
                Tim White Showcase
              </p>
              <h1 className='mt-3 text-[clamp(2rem,4vw,3.2rem)] font-[630] tracking-[-0.06em] text-white'>
                {title}
              </h1>
              <p className='mt-3 max-w-[38rem] text-[14px] leading-[1.7] text-white/62'>
                {subtitle}
              </p>
            </div>
            <div className='mt-8'>{children}</div>
          </div>
        </div>
      </div>
    </DemoClientProviders>
  );
}

function ShowcaseBoardCard({
  title,
  description,
  children,
}: Readonly<{
  title: string;
  description?: string;
  children: React.ReactNode;
}>) {
  return (
    <article className='rounded-[28px] border border-white/8 bg-white/[0.03] p-4 shadow-[0_28px_84px_rgba(0,0,0,0.32)]'>
      <div className='mb-4'>
        <h2 className='text-[18px] font-[620] tracking-[-0.04em] text-white'>
          {title}
        </h2>
        {description ? (
          <p className='mt-1 text-[12px] leading-[1.55] text-white/56'>
            {description}
          </p>
        ) : null}
      </div>
      <div className='rounded-[24px] border border-white/8 bg-[#0b0f16] p-3'>
        {children}
      </div>
    </article>
  );
}

function renderActionCardPreview({
  dataTestId,
  latestRelease = null,
  featuredPlaylistFallback,
  tourDates,
  hasPlayableDestinations,
  previewActionLabel,
  viewerLocation,
  resolveNearbyTour,
}: Readonly<ActionCardPreviewConfig>) {
  return (
    <ProfilePrimaryActionCard
      artist={HOMEPAGE_PROFILE_PREVIEW_ARTIST}
      latestRelease={latestRelease}
      profileSettings={SHOWCASE_PROFILE_SETTINGS}
      featuredPlaylistFallback={featuredPlaylistFallback}
      tourDates={tourDates}
      hasPlayableDestinations={hasPlayableDestinations}
      renderMode='preview'
      previewActionLabel={previewActionLabel}
      viewerLocation={viewerLocation}
      resolveNearbyTour={resolveNearbyTour}
      size='showcase'
      now={SHOWCASE_NOW}
      className={SHOWCASE_ACTION_CARD_CLASS_NAME}
      dataTestId={dataTestId}
    />
  );
}

function formatSubscribeStateLabel(
  stateId: (typeof SUBSCRIBE_SHOWCASE_STATE_IDS)[number]
) {
  return stateId
    .replace('subscribe-', '')
    .replace('fans-opt-in', 'button')
    .replaceAll('-', ' ')
    .replaceAll(/\b\w/g, match => match.toUpperCase());
}

function ActionCardShowcaseBoard() {
  const nextTourViewerLocation = {
    latitude: 40.7128,
    longitude: -74.006,
  } as const;

  const cardShowcaseItems = [
    {
      id: 'release-live',
      label: 'Latest release',
      description:
        'Real release metadata with album art and collaborator copy.',
      card: renderActionCardPreview({
        dataTestId: 'tim-white-cards-release-live',
        latestRelease: HOMEPAGE_PROFILE_PREVIEW_RELEASES.live,
        tourDates: [],
        hasPlayableDestinations: true,
        previewActionLabel: 'Listen',
      }),
    },
    {
      id: 'release-countdown',
      label: 'Countdown',
      description: 'Future release state with the countdown card leading.',
      card: renderActionCardPreview({
        dataTestId: 'tim-white-cards-release-countdown',
        latestRelease: HOMEPAGE_PROFILE_PREVIEW_RELEASES.presave,
        tourDates: [],
        hasPlayableDestinations: true,
        previewActionLabel: 'Listen',
      }),
    },
    {
      id: 'tour-nearby',
      label: 'Nearby tour',
      description: 'Geo-aware nearby date when there is no release to feature.',
      card: renderActionCardPreview({
        dataTestId: 'tim-white-cards-tour-nearby',
        tourDates: HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES,
        hasPlayableDestinations: false,
        viewerLocation: SHOWCASE_VIEWER_LOCATION,
      }),
    },
    {
      id: 'tour-next',
      label: 'Next tour',
      description:
        'Fallback upcoming date when the viewer is not near a venue.',
      card: renderActionCardPreview({
        dataTestId: 'tim-white-cards-tour-next',
        tourDates: HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES,
        hasPlayableDestinations: false,
        viewerLocation: nextTourViewerLocation,
        resolveNearbyTour: false,
      }),
    },
    {
      id: 'playlist-fallback',
      label: 'Playlist fallback',
      description: 'Real playlist fallback when there is no release or tour.',
      card: renderActionCardPreview({
        dataTestId: 'tim-white-cards-playlist-fallback',
        featuredPlaylistFallback: HOMEPAGE_PROFILE_PREVIEW_PLAYLIST_FALLBACK,
        tourDates: [],
        hasPlayableDestinations: false,
      }),
    },
    {
      id: 'listen-fallback',
      label: 'Listen fallback',
      description:
        'Clean listen CTA when the profile still has DSP destinations.',
      card: renderActionCardPreview({
        dataTestId: 'tim-white-cards-listen-fallback',
        tourDates: [],
        hasPlayableDestinations: true,
        previewActionLabel: 'Listen',
      }),
    },
  ] as const;

  return (
    <DemoShowcaseShell
      testId='demo-showcase-tim-white-profile-cards'
      title='Primary Action Card States'
      subtitle='These are the exact Tim White card states the live profile and the marketing proof now share.'
    >
      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
        {cardShowcaseItems.map(item => (
          <ShowcaseBoardCard
            key={item.id}
            title={item.label}
            description={item.description}
          >
            {item.card}
          </ShowcaseBoardCard>
        ))}
      </div>
    </DemoShowcaseShell>
  );
}

function SubscribeShowcaseBoard() {
  return (
    <DemoShowcaseShell
      testId='demo-showcase-tim-white-profile-subscribe'
      title='Inline Notifications Flow'
      subtitle='Each step keeps the same footprint so the subscribe flow can be reviewed without layout shift.'
    >
      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
        {SUBSCRIBE_SHOWCASE_STATE_IDS.map(stateId => (
          <ShowcaseBoardCard
            key={stateId}
            title={formatSubscribeStateLabel(stateId)}
          >
            <div className='flex items-center justify-center'>
              <HomeProfileShowcase
                stateId={stateId}
                presentation='full-phone'
                compact
                hideJovieBranding
                hideMoreMenu
                className='scale-[0.9] origin-top'
              />
            </div>
          </ShowcaseBoardCard>
        ))}
      </div>
    </DemoShowcaseShell>
  );
}

function SingleStatePhonePreview({
  stateId,
  referenceImageSrc,
}: Readonly<{
  stateId: ProfileShowcaseStateId;
  referenceImageSrc?: string;
}>) {
  return (
    <DemoShowcaseShell
      testId='demo-showcase-tim-white-profile-state'
      title='Single Profile State'
      subtitle='Use the state query param to pin one Tim White profile state for screenshots or focused review.'
    >
      <div className='flex items-center justify-center'>
        <HomeProfileShowcase
          stateId={stateId}
          presentation='full-phone'
          hideJovieBranding
          hideMoreMenu
          phoneClassName='max-w-[24rem]'
          referenceImageSrc={referenceImageSrc}
        />
      </div>
    </DemoShowcaseShell>
  );
}

export function DemoTimWhiteProfileSurface() {
  const searchParams = useSearchParams();
  const modeParam = searchParams.get('mode');
  const releaseParam = searchParams.get('release');
  const captureMode = searchParams.get('capture');
  const showcaseParam = searchParams.get('showcase');
  const stateParam = searchParams.get('state');

  const mode: ProfileMode = isProfileMode(modeParam) ? modeParam : 'profile';
  const releaseKey: ReleaseVariant = isValidRelease(releaseParam)
    ? releaseParam
    : 'live';
  const showcaseMode = isDemoTimWhiteShowcaseMode(showcaseParam)
    ? showcaseParam
    : null;
  const showcaseState = isProfileShowcaseStateId(stateParam)
    ? stateParam
    : null;
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
                    <p className='text-[12px] font-semibold text-white/50'>
                      About
                    </p>
                    <h2 className='mt-1 text-[20px] font-[600] tracking-[-0.03em] text-white'>
                      Share press photos
                    </h2>
                  </div>
                  <div className='rounded-[18px] border border-white/8 bg-[#10141c] p-2 shadow-[0_12px_40px_rgba(0,0,0,0.35)]'>
                    <div className='rounded-[12px] bg-white/[0.04] px-3 py-2 text-[12px] font-semibold text-white'>
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

  if (showcaseMode === 'cards') {
    return <ActionCardShowcaseBoard />;
  }

  if (showcaseMode === 'subscribe') {
    return <SubscribeShowcaseBoard />;
  }

  if (showcaseState) {
    return (
      <SingleStatePhonePreview
        stateId={showcaseState}
        referenceImageSrc={
          captureMode === 'reference' && showcaseState === 'mock-home'
            ? '/images/mock-profile/tim-white-mock-home-full.png'
            : undefined
        }
      />
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
          profileSettings={SHOWCASE_PROFILE_SETTINGS}
          hideJovieBranding
          hideMoreMenu
        />
      </div>
    </DemoClientProviders>
  );
}
