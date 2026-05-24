'use client';

import { useState } from 'react';
import { ProfileMediaCard } from '@/features/profile/ProfileMediaCard';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { useReleaseAwareNow } from '@/hooks/useReleaseAwareNow';
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

function isValidDate(d: Date | null): d is Date {
  return d !== null && !Number.isNaN(d.getTime());
}

function formatReleaseType(type: string): string {
  if (type === 'ep') return 'EP';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function buildActionLabel(isFuture: boolean): string {
  return isFuture ? 'Notify me' : 'Listen Now';
}

function buildActionIcon(isFuture: boolean): 'Bell' | 'Play' {
  return isFuture ? 'Bell' : 'Play';
}

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
  const now = useReleaseAwareNow(releaseDate);
  const validDate = isValidDate(releaseDate);
  const releaseYear = validDate ? releaseDate.getUTCFullYear() : null;
  const isFutureRelease = validDate && releaseDate.getTime() > now.getTime();
  const releaseTypeLabel = formatReleaseType(release.releaseType);
  const showDrawer = isMobile && artist && dsps && dsps.length > 0;
  const label = buildActionLabel(isFutureRelease);
  const icon = buildActionIcon(isFutureRelease);

  const action = showDrawer
    ? { label, onClick: () => setDrawerOpen(true), icon }
    : { label, href: `/${artistHandle}/${release.slug}`, icon };

  return (
    <>
      <ProfileMediaCard
        eyebrow={isFutureRelease ? 'New Single' : 'New Release'}
        title={release.title}
        subtitle={releaseTypeLabel + (releaseYear ? ' · ' + releaseYear : '')}
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
        action={action}
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
