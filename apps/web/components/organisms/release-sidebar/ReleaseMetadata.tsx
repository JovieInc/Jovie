'use client';

import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SimpleTooltip,
} from '@jovie/ui';
import { Check, ChevronDown, Info } from 'lucide-react';
import { CopyableMonospaceCell } from '@/components/atoms/CopyableMonospaceCell';

import { DrawerPropertyRow } from '@/components/molecules/drawer';
import { getReleaseTypeStyle } from '@/lib/discography/release-type-styles';
import type { CanvasStatus } from '@/lib/services/canvas/types';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/formatDuration';
import type { Release } from './types';

const CANVAS_STATUS_CONFIG: Record<
  CanvasStatus,
  { label: string; className: string; displayLabel?: string }
> = {
  uploaded: {
    label: 'Has video',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
  generated: {
    label: 'Ready to upload',
    className: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  },
  not_set: {
    label: 'No video',
    displayLabel: 'Has video',
    className:
      'border-(--linear-border-subtle) bg-(--linear-bg-surface-1) text-(--linear-text-secondary)',
  },
};

const CANVAS_STATUS_OPTIONS: CanvasStatus[] = ['uploaded', 'not_set'];

function PopularityScore({ value }: { readonly value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span className='text-[13px] tabular-nums text-(--linear-text-secondary)'>
      {clamped} / 100
    </span>
  );
}

function ReleaseTypeBadges({ release }: { readonly release: Release }) {
  const typeStyle = getReleaseTypeStyle(release.releaseType);
  return (
    <div className='flex items-center gap-1.5'>
      <Badge
        size='sm'
        className={`${typeStyle.border} ${typeStyle.bg} ${typeStyle.text}`}
      >
        {typeStyle.label}
      </Badge>
      {release.isExplicit && (
        <Badge
          size='sm'
          className='border-red-500/20 bg-red-500/10 text-red-600 shadow-none dark:text-red-300'
        >
          E
        </Badge>
      )}
    </div>
  );
}

interface ReleaseMetadataProps {
  readonly release: Release;
  readonly onCanvasStatusChange?: (status: CanvasStatus) => void;
}

function formatCopyrightLine(line: string, symbol: '℗' | '©'): string {
  const normalized = line.replace(/^[℗©\s]+/u, '').trim();
  return `${symbol} ${normalized}`;
}

function CopyrightLabel({
  symbol,
  description,
}: {
  readonly symbol: '℗' | '©';
  readonly description: string;
}) {
  return (
    <span className='inline-flex items-center gap-1'>
      <span>{symbol}</span>
      <SimpleTooltip content={description} side='top'>
        <span className='inline-flex items-center'>
          <Info
            size={12}
            aria-hidden='true'
            className='text-muted-foreground'
          />
          <span className='sr-only'>{description}</span>
        </span>
      </SimpleTooltip>
    </span>
  );
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
    <div className='space-y-0.5'>
      <DrawerPropertyRow
        label='Type'
        value={<ReleaseTypeBadges release={release} />}
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
            <span className='text-[13px] text-(--linear-text-tertiary)'>
              Unknown
            </span>
          )
        }
      />
      {release.copyrightLine && (
        <DrawerPropertyRow
          label={
            <CopyrightLabel
              symbol='℗'
              description='Sound recording copyright (phonogram rights)'
            />
          }
          value={
            <span className='truncate text-[13px] text-(--linear-text-secondary)'>
              {formatCopyrightLine(release.copyrightLine, '℗')}
            </span>
          }
        />
      )}

      {release.distributor && (
        <DrawerPropertyRow
          label={
            <CopyrightLabel
              symbol='©'
              description='Composition copyright (musical work)'
            />
          }
          value={
            <span className='truncate text-[13px] text-(--linear-text-secondary)'>
              {formatCopyrightLine(release.distributor, '©')}
            </span>
          }
        />
      )}

      <DrawerPropertyRow
        label='Tracks'
        value={
          <span className='text-[13px] tabular-nums'>
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
                  className='-mx-1 inline-flex items-center gap-1 rounded-[6px] border border-transparent px-1 py-0.5 text-[13px] text-(--linear-text-secondary) transition-[background-color,color,border-color,box-shadow] duration-150 hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary) focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-(--linear-bg-surface-1) focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
                >
                  <span>{canvasStatusDisplayLabel}</span>
                  <ChevronDown
                    size={12}
                    className='text-(--linear-text-tertiary)'
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
                      className={cn(isActive && 'font-medium')}
                    >
                      <span className='flex items-center gap-2 w-full'>
                        <Badge
                          variant='secondary'
                          className={`border text-[10px] font-medium shadow-none ${config.className}`}
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
              className={`border text-[10px] font-medium shadow-none ${canvasStatusConfig.className}`}
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
            <span className='text-[13px] tabular-nums'>
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
                  className='bg-(--linear-bg-surface-1) text-[10px] font-normal shadow-none'
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
          value={<PopularityScore value={release.spotifyPopularity} />}
        />
      )}
    </div>
  );
}
