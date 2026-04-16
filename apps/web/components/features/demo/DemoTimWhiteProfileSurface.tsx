'use client';

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
import {
  StaticArtistPage,
  type StaticArtistPageProps,
} from '@/features/profile/StaticArtistPage';
import { DemoClientProviders } from './DemoClientProviders';

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

const VALID_MODES: readonly ProfileMode[] = [
  'profile',
  'tour',
  'pay',
  'subscribe',
  'listen',
  'contact',
  'about',
  'releases',
];

function isValidMode(value: string | null): value is ProfileMode {
  return VALID_MODES.includes(value as ProfileMode);
}

function isValidRelease(value: string | null): value is ReleaseVariant {
  return RELEASE_VARIANT_KEYS.includes(value as ReleaseVariant);
}

export function DemoTimWhiteProfileSurface() {
  const searchParams = useSearchParams();
  const modeParam = searchParams.get('mode');
  const releaseParam = searchParams.get('release');

  const mode: ProfileMode = isValidMode(modeParam) ? modeParam : 'profile';
  const releaseKey: ReleaseVariant = isValidRelease(releaseParam)
    ? releaseParam
    : 'live';
  const releaseVariants = useMemo(() => getReleaseVariants(Date.now()), []);
  const latestRelease = makeDemoRelease(releaseVariants[releaseKey]);

  // For presave, omit tour dates so the countdown card renders instead
  const tourDates =
    releaseKey === 'presave' ? [] : [...HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES];

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
