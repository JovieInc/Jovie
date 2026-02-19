'use client';

import { Badge } from '@jovie/ui';
import { CopyableMonospaceValue } from '@/components/molecules/CopyableMonospaceValue';
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

const CANVAS_STATUS_CONFIG = {
  uploaded: {
    label: 'Live',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
  generated: {
    label: 'Ready to upload',
    className: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  },
  not_set: {
    label: 'Not set',
    className: 'bg-surface-2 text-secondary-token',
  },
} as const;

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
  const canvasStatus = release.canvasStatus ?? 'not_set';
  const canvasStatusConfig =
    CANVAS_STATUS_CONFIG[canvasStatus] ?? CANVAS_STATUS_CONFIG.not_set;

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
            <CopyableMonospaceValue
              value={release.primaryIsrc}
              label='ISRC'
              maxWidth={140}
            />
          }
        />

        <DrawerPropertyRow
          label='UPC'
          value={
            <CopyableMonospaceValue
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

        <DrawerPropertyRow
          label='Canvas'
          value={
            <Badge
              variant='secondary'
              className={`text-[10px] font-medium ${canvasStatusConfig.className}`}
            >
              {canvasStatusConfig.label}
            </Badge>
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
                {release.genres.map(genre => (
                  <Badge
                    key={genre}
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
