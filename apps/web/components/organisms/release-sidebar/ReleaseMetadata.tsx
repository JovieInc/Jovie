'use client';

import { Badge } from '@jovie/ui';
import { CopyableMonospaceCell } from '@/components/atoms/CopyableMonospaceCell';
import {
  DrawerPropertyRow,
  DrawerSection,
} from '@/components/molecules/drawer';
import { formatDuration } from '@/lib/utils/formatDuration';
import type { Release } from './types';

const RELEASE_TYPE_LABELS: Record<string, string> = {
  single: 'Single',
  ep: 'EP',
  album: 'Album',
  compilation: 'Compilation',
  live: 'Live',
  mixtape: 'Mixtape',
  other: 'Other',
};

function PopularityBar({ value }: { readonly value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className='flex items-center gap-2'>
      <div className='h-1.5 flex-1 rounded-full bg-surface-2'>
        <div
          className='h-full rounded-full bg-primary transition-all'
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className='text-xs tabular-nums text-secondary-token'>
        {clamped}
      </span>
    </div>
  );
}

interface ReleaseMetadataProps {
  readonly release: Release;
}

export function ReleaseMetadata({ release }: ReleaseMetadataProps) {
  return (
    <DrawerSection title='Metadata'>
      <div className='space-y-2.5'>
        <DrawerPropertyRow
          label='Type'
          value={
            <Badge
              variant='secondary'
              className='bg-surface-2 text-xs font-medium'
            >
              {RELEASE_TYPE_LABELS[release.releaseType] ?? release.releaseType}
            </Badge>
          }
        />

        <DrawerPropertyRow
          label='ISRC'
          value={
            <CopyableMonospaceCell
              value={release.primaryIsrc}
              label='ISRC'
              maxWidth={140}
            />
          }
        />

        <DrawerPropertyRow
          label='UPC'
          value={
            <CopyableMonospaceCell
              value={release.upc}
              label='UPC'
              maxWidth={140}
            />
          }
        />

        <DrawerPropertyRow
          label='Label'
          value={
            release.label ? (
              <span className='text-xs'>{release.label}</span>
            ) : (
              <span className='text-xs text-tertiary-token'>Unknown</span>
            )
          }
        />

        <DrawerPropertyRow
          label='Tracks'
          value={
            <span className='text-xs tabular-nums'>
              {release.totalTracks}{' '}
              {release.totalTracks === 1 ? 'track' : 'tracks'}
            </span>
          }
        />

        {release.totalDurationMs != null && release.totalDurationMs > 0 && (
          <DrawerPropertyRow
            label='Duration'
            value={
              <span className='text-xs tabular-nums'>
                {formatDuration(release.totalDurationMs)}
              </span>
            }
          />
        )}

        {release.genres && release.genres.length > 0 && (
          <DrawerPropertyRow
            label='Genres'
            value={
              <div className='flex flex-wrap gap-1'>
                {release.genres.map((genre, index) => (
                  <Badge
                    key={`${genre}-${index}`}
                    variant='secondary'
                    className='bg-surface-2 text-[10px] font-normal'
                  >
                    {genre}
                  </Badge>
                ))}
              </div>
            }
          />
        )}

        {release.spotifyPopularity != null && (
          <DrawerPropertyRow
            label='Popularity'
            value={<PopularityBar value={release.spotifyPopularity} />}
          />
        )}
      </div>
    </DrawerSection>
  );
}
