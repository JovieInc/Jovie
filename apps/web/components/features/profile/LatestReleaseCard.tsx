'use client';

import { useState } from 'react';
import { ProfileMediaCard } from '@/features/profile/ProfileMediaCard';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import type { AvailableDSP } from '@/lib/dsp';
import type { Artist } from '@/types/db';
import { ListenDrawer } from './ListenDrawer';

type ReleaseCardData = {
  title: string;
  slug: string;
  artworkUrl: string | null;
  releaseDate: Date | string | null;
  releaseType: string;
};

type LatestReleaseCardProps = {
  readonly release: ReleaseCardData;
  readonly artistHandle: string;
  readonly artist?: Artist;
  readonly dsps?: AvailableDSP[];
  readonly enableDynamicEngagement?: boolean;
};

export function LatestReleaseCard({
  release,
  artistHandle,
  artist,
  dsps,
  enableDynamicEngagement = false,
}: LatestReleaseCardProps) {
  const isMobile = useBreakpointDown('md');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const releaseDate = release.releaseDate
    ? new Date(release.releaseDate)
    : null;
  const releaseYear =
    releaseDate && !Number.isNaN(releaseDate.getTime())
      ? releaseDate.getUTCFullYear()
      : null;
  const isFutureRelease =
    releaseDate !== null &&
    !Number.isNaN(releaseDate.getTime()) &&
    releaseDate.getTime() > Date.now();
  const releaseTypeLabel =
    release.releaseType === 'ep'
      ? 'EP'
      : release.releaseType.charAt(0).toUpperCase() +
        release.releaseType.slice(1);
  const showDrawer = isMobile && artist && dsps && dsps.length > 0;

  return (
    <>
      <ProfileMediaCard
        eyebrow={isFutureRelease ? 'New Single' : 'New Release'}
        title={release.title}
        subtitle={`${releaseTypeLabel}${releaseYear ? ` · ${releaseYear}` : ''}`}
        imageUrl={release.artworkUrl}
        imageAlt={`${release.title} artwork`}
        fallbackVariant='release'
        accent='purple'
        ratio='landscape'
        countdown={
          isFutureRelease && releaseDate
            ? { targetDate: releaseDate, label: 'Drops in' }
            : null
        }
        status={isFutureRelease ? null : { label: 'Out Now', tone: 'green' }}
        action={
          showDrawer
            ? {
                label: isFutureRelease ? 'Notify me' : 'Listen Now',
                onClick: () => setDrawerOpen(true),
                icon: isFutureRelease ? 'Bell' : 'Play',
              }
            : {
                label: isFutureRelease ? 'Notify me' : 'Listen Now',
                href: `/${artistHandle}/${release.slug}`,
                icon: isFutureRelease ? 'Bell' : 'Play',
              }
        }
        dataTestId='latest-release-card'
      />
      {showDrawer ? (
        <ListenDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          artist={artist}
          dsps={dsps}
          enableDynamicEngagement={enableDynamicEngagement}
        />
      ) : null}
    </>
  );
}
