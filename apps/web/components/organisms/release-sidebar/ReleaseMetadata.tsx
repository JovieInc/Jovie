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

import { DrawerButton, DrawerPropertyRow } from '@/components/molecules/drawer';
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
    className: 'border-subtle bg-surface-1 text-secondary-token',
  },
};

const CANVAS_STATUS_OPTIONS: CanvasStatus[] = ['uploaded', 'not_set'];
const METADATA_ROW_PROPS = {
  labelWidth: 72,
  size: 'sm' as const,
};
const METADATA_TEXT_CLASSNAME =
  'text-[11px] leading-[14px] text-secondary-token';
const METADATA_MUTED_TEXT_CLASSNAME =
  'text-[10.5px] leading-[14px] text-tertiary-token';
const METADATA_BADGE_CLASSNAME = 'text-[9.5px] font-[510]';

function PopularityScore({ value }: { readonly value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span className='text-[11px] tabular-nums text-secondary-token'>
      {clamped} / 100
    </span>
  );
}

function ReleaseTypeBadges({ release }: { readonly release: Release }) {
  const typeStyle = getReleaseTypeStyle(release.releaseType);
  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <Badge
        size='sm'
        className={`h-5 rounded-md px-1.5 text-[9.5px] font-[510] ${typeStyle.bg} ${typeStyle.text}`}
      >
        {typeStyle.label}
      </Badge>
      {release.isExplicit && (
        <Badge
          size='sm'
          className='h-5 rounded-md bg-red-500/10 px-1.5 text-[9.5px] font-[510] text-red-600 dark:text-red-300'
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

function MetadataFallbackValue({ children }: { readonly children: string }) {
  return <span className={METADATA_MUTED_TEXT_CLASSNAME}>{children}</span>;
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
    <div className='space-y-2'>
      <DrawerPropertyRow
        {...METADATA_ROW_PROPS}
        label='Type'
        value={<ReleaseTypeBadges release={release} />}
        align='start'
      />

      <DrawerPropertyRow
        {...METADATA_ROW_PROPS}
        label='ISRC'
        value={
          <CopyableMonospaceCell
            value={release.primaryIsrc}
            label='ISRC'
            size='sm'
            maxWidth={140}
          />
        }
      />

      <DrawerPropertyRow
        {...METADATA_ROW_PROPS}
        label='UPC'
        value={
          <CopyableMonospaceCell
            value={release.upc}
            label='UPC'
            size='sm'
            maxWidth={140}
          />
        }
      />

      <DrawerPropertyRow
        {...METADATA_ROW_PROPS}
        label='Label'
        value={
          release.label ? (
            <CopyableMonospaceCell
              value={release.label}
              label='Label'
              size='sm'
              maxWidth={140}
              className='font-sans'
            />
          ) : (
            <MetadataFallbackValue>Unknown</MetadataFallbackValue>
          )
        }
      />
      {release.copyrightLine && (
        <DrawerPropertyRow
          {...METADATA_ROW_PROPS}
          label={
            <CopyrightLabel
              symbol='℗'
              description='Sound recording copyright (phonogram rights)'
            />
          }
          value={
            <span className={cn('truncate', METADATA_TEXT_CLASSNAME)}>
              {formatCopyrightLine(release.copyrightLine, '℗')}
            </span>
          }
          align='start'
        />
      )}

      {release.distributor && (
        <DrawerPropertyRow
          {...METADATA_ROW_PROPS}
          label={
            <CopyrightLabel
              symbol='©'
              description='Composition copyright (musical work)'
            />
          }
          value={
            <span className={cn('truncate', METADATA_TEXT_CLASSNAME)}>
              {formatCopyrightLine(release.distributor, '©')}
            </span>
          }
          align='start'
        />
      )}

      <DrawerPropertyRow
        {...METADATA_ROW_PROPS}
        label='Tracks'
        value={
          <span className='text-[11px] tabular-nums text-secondary-token'>
            {release.totalTracks}{' '}
            {release.totalTracks === 1 ? 'track' : 'tracks'}
          </span>
        }
      />

      <DrawerPropertyRow
        {...METADATA_ROW_PROPS}
        label='Canvas'
        value={
          onCanvasStatusChange ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <DrawerButton
                  tone='ghost'
                  size='sm'
                  className='-mx-1 h-6 gap-1 rounded-md border-transparent px-1 py-0.5 text-[11px] font-[400] leading-[14px] text-secondary-token'
                >
                  <span>{canvasStatusDisplayLabel}</span>
                  <ChevronDown
                    size={12}
                    className='text-tertiary-token'
                    aria-hidden='true'
                  />
                </DrawerButton>
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
                          className={`${METADATA_BADGE_CLASSNAME} ${config.className}`}
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
              className={`${METADATA_BADGE_CLASSNAME} ${canvasStatusConfig.className}`}
            >
              {canvasStatusDisplayLabel}
            </Badge>
          )
        }
      />

      {release.totalDurationMs != null && release.totalDurationMs > 0 && (
        <DrawerPropertyRow
          {...METADATA_ROW_PROPS}
          label='Duration'
          value={
            <span className='text-[11px] tabular-nums text-secondary-token'>
              {formatDuration(release.totalDurationMs)}
            </span>
          }
        />
      )}

      {release.genres && release.genres.length > 0 && (
        <DrawerPropertyRow
          {...METADATA_ROW_PROPS}
          label='Genres'
          value={
            <div className='flex flex-wrap gap-1'>
              {release.genres.slice(0, 3).map(genre => (
                <Badge
                  key={genre}
                  variant='secondary'
                  className='rounded-md bg-surface-1 px-1.5 py-0 text-[9.5px] font-[510] text-secondary-token'
                >
                  {genre}
                </Badge>
              ))}
            </div>
          }
          align='start'
        />
      )}

      {release.spotifyPopularity != null && (
        <DrawerPropertyRow
          {...METADATA_ROW_PROPS}
          label='Popularity'
          value={<PopularityScore value={release.spotifyPopularity} />}
        />
      )}
    </div>
  );
}
