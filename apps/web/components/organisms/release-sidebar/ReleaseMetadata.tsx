'use client';

import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { Check, ChevronDown } from 'lucide-react';
import { CopyableMonospaceCell } from '@/components/atoms/CopyableMonospaceCell';
import {
  DrawerPropertyRow,
  DrawerSection,
} from '@/components/molecules/drawer';
import type { CanvasStatus } from '@/lib/services/canvas/types';
import { cn } from '@/lib/utils';
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

const CANVAS_STATUS_CONFIG: Record<
  CanvasStatus,
  { label: string; className: string }
> = {
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
};

const CANVAS_STATUS_OPTIONS: CanvasStatus[] = [
  'not_set',
  'generated',
  'uploaded',
];

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
  readonly onCanvasStatusChange?: (status: CanvasStatus) => void;
}

export function ReleaseMetadata({
  release,
  onCanvasStatusChange,
}: ReleaseMetadataProps) {
  const canvasStatus: CanvasStatus = release.canvasStatus ?? 'not_set';
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

        <DrawerPropertyRow
          label='Canvas'
          value={
            onCanvasStatusChange ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type='button'
                    className='inline-flex items-center gap-1 rounded-md px-0.5 -mx-0.5 py-0.5 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:bg-surface-2'
                  >
                    <Badge
                      variant='secondary'
                      className={`text-[10px] font-medium ${canvasStatusConfig.className}`}
                    >
                      {canvasStatusConfig.label}
                    </Badge>
                    <ChevronDown
                      size={12}
                      className='text-tertiary-token'
                      aria-hidden='true'
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='start' className='w-44'>
                  {CANVAS_STATUS_OPTIONS.map(status => {
                    const config = CANVAS_STATUS_CONFIG[status];
                    const isActive = status === canvasStatus;
                    return (
                      <DropdownMenuItem
                        key={status}
                        onClick={() => onCanvasStatusChange(status)}
                        className={cn(isActive && 'font-medium')}
                      >
                        <span className='flex items-center gap-2 w-full'>
                          <Badge
                            variant='secondary'
                            className={`text-[10px] font-medium ${config.className}`}
                          >
                            {config.label}
                          </Badge>
                          {isActive && (
                            <Check
                              size={14}
                              className='ml-auto text-primary-token'
                              aria-hidden='true'
                            />
                          )}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Badge
                variant='secondary'
                className={`text-[10px] font-medium ${canvasStatusConfig.className}`}
              >
                {canvasStatusConfig.label}
              </Badge>
            )
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
