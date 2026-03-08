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
import { SocialIcon } from '@/components/atoms/SocialIcon';
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
  { label: string; className: string; displayLabel?: string }
> = {
  uploaded: {
    label: 'Set',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
  generated: {
    label: 'Ready to upload',
    className: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  },
  not_set: {
    label: 'Not set',
    displayLabel: 'Set',
    className: 'bg-surface-2 text-secondary-token',
  },
};

const CANVAS_STATUS_OPTIONS: CanvasStatus[] = ['uploaded', 'not_set'];

function PopularityScore({ value }: { readonly value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span className='text-[11px] tabular-nums text-secondary-token'>
      {clamped} / 100
    </span>
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
  const selectionStatus: CanvasStatus =
    canvasStatus === 'generated' ? 'not_set' : canvasStatus;
  const canvasStatusConfig =
    CANVAS_STATUS_CONFIG[canvasStatus] ?? CANVAS_STATUS_CONFIG.not_set;
  const canvasStatusDisplayLabel =
    canvasStatusConfig.displayLabel ?? canvasStatusConfig.label;

  return (
    <DrawerSection title='Metadata'>
      <div className='space-y-2.5'>
        <DrawerPropertyRow
          label='Type'
          value={
            <div className='flex items-center gap-1.5'>
              <Badge
                variant='secondary'
                className='bg-surface-2 text-[13px] font-[510]'
              >
                {RELEASE_TYPE_LABELS[release.releaseType] ??
                  release.releaseType}
              </Badge>
              {release.isExplicit && (
                <Badge
                  variant='secondary'
                  className='bg-red-500/15 px-1 py-0 text-[10px] font-[510] text-red-700 dark:text-red-300'
                >
                  E
                </Badge>
              )}
            </div>
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
              <CopyableMonospaceCell
                value={release.label}
                label='Label'
                maxWidth={140}
                className='font-sans'
              />
            ) : (
              <span className='text-[11px] text-tertiary-token'>Unknown</span>
            )
          }
        />

        {release.distributor && (
          <DrawerPropertyRow
            label='Distributor'
            value={
              <span className='text-[11px] text-secondary-token truncate max-w-[180px]'>
                {release.distributor}
              </span>
            }
          />
        )}

        {release.copyrightLine && (
          <DrawerPropertyRow
            label='℗'
            value={
              <span className='text-[11px] text-secondary-token truncate max-w-[180px]'>
                {release.copyrightLine}
              </span>
            }
          />
        )}

        <DrawerPropertyRow
          label='Tracks'
          value={
            <span className='text-[11px] tabular-nums'>
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
                    className='inline-flex items-center gap-1 rounded-md px-1 -mx-1 py-0.5 text-[11px] text-secondary-token transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:bg-surface-2'
                  >
                    <span>{canvasStatusDisplayLabel}</span>
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
                    const isActive = status === selectionStatus;
                    return (
                      <DropdownMenuItem
                        key={status}
                        onClick={() => onCanvasStatusChange(status)}
                        className={cn(isActive && 'font-[510]')}
                      >
                        <span className='flex items-center gap-2 w-full'>
                          <Badge
                            variant='secondary'
                            className={`text-[10px] font-[510] ${config.className}`}
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
                className={`text-[10px] font-[510] ${canvasStatusConfig.className}`}
              >
                {canvasStatusDisplayLabel}
              </Badge>
            )
          }
        />

        {release.totalDurationMs != null && release.totalDurationMs > 0 && (
          <DrawerPropertyRow
            label='Duration'
            value={
              <span className='text-[11px] tabular-nums'>
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
            label={
              <span title='Spotify Popularity'>
                <SocialIcon
                  platform='spotify'
                  className='h-3.5 w-3.5 text-tertiary-token'
                  aria-label='Spotify Popularity'
                  aria-hidden={false}
                />
              </span>
            }
            value={<PopularityScore value={release.spotifyPopularity} />}
          />
        )}
      </div>
    </DrawerSection>
  );
}
