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
import { useEffect, useRef } from 'react';
import {
  DrawerButton,
  DrawerEditableTextField,
  DrawerPropertyRow,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { LINEAR_SURFACE } from '@/components/tokens/linear-surface';
import { getReleaseTypeStyle } from '@/lib/discography/release-type-styles';
import type { CanvasStatus } from '@/lib/services/canvas/types';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/formatDuration';
import type { Release } from './types';

const CANVAS_STATUS_CONFIG: Record<
  CanvasStatus,
  { label: string; className: string; displayLabel?: string }
> = {
  processing: {
    label: 'Processing',
    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  },
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
  size: 'sm' as const,
};
const METADATA_TEXT_CLASSNAME =
  'text-[12px] font-[460] leading-[16px] text-secondary-token';
const METADATA_MUTED_TEXT_CLASSNAME =
  'text-[11px] leading-[15px] text-tertiary-token';
const METADATA_LABEL_CLASSNAME =
  'text-[11px] font-[500] leading-[15px] tracking-normal text-quaternary-token';
const METADATA_VALUE_CLASSNAME =
  'text-[12px] leading-[16px] text-secondary-token';
const METADATA_BADGE_CLASSNAME =
  'h-5 rounded-full border border-subtle bg-surface-0 px-2 text-[9.5px] font-[510] tracking-normal shadow-none';
const METADATA_ROW_CLASSNAME = 'rounded-none px-0 py-1 first:pt-0 last:pb-0';
const METADATA_STACK_CLASSNAME = 'space-y-0.5';
const METADATA_DISPLAY_VALUE_CLASSNAME =
  'text-[11.5px] font-[460] leading-[16px] text-primary-token';
const METADATA_INPUT_CLASSNAME =
  'h-7 rounded-[8px] border-subtle bg-surface-0 px-2.5 text-[11px] font-[460] text-primary-token shadow-none';

function PopularityScore({ value }: { readonly value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span className='text-[11.5px] font-[460] tabular-nums text-primary-token'>
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
        className={`${METADATA_BADGE_CLASSNAME} ${typeStyle.bg} ${typeStyle.text}`}
      >
        {typeStyle.label}
      </Badge>
      {release.isExplicit && (
        <Badge
          size='sm'
          className='h-5 rounded-full border border-transparent bg-red-500/10 px-2 text-[9.5px] font-[510] tracking-normal text-red-600 shadow-none dark:text-red-300'
        >
          E
        </Badge>
      )}
    </div>
  );
}

interface ReleaseMetadataProps {
  readonly release: Release;
  readonly isEditable?: boolean;
  readonly onSaveMetadata?: (
    releaseId: string,
    values: { upc: string | null; label: string | null }
  ) => Promise<void>;
  readonly onSavePrimaryIsrc?: (
    releaseId: string,
    isrc: string | null
  ) => Promise<void>;
  readonly onCanvasStatusChange?: (status: CanvasStatus) => void;
  readonly variant?: 'card' | 'flat';
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
  isEditable = false,
  onSaveMetadata,
  onSavePrimaryIsrc,
  onCanvasStatusChange,
  variant = 'card',
}: ReleaseMetadataProps) {
  const canvasStatus: CanvasStatus = release.canvasStatus ?? 'not_set';
  const selectionStatus: CanvasStatus =
    canvasStatus === 'generated' || canvasStatus === 'processing'
      ? 'not_set'
      : canvasStatus;
  const canvasStatusConfig =
    CANVAS_STATUS_CONFIG[canvasStatus] ?? CANVAS_STATUS_CONFIG.not_set;
  const canvasStatusDisplayLabel =
    canvasStatusConfig.displayLabel ?? canvasStatusConfig.label;
  const canEditMetadata = isEditable && Boolean(onSaveMetadata);
  const canEditPrimaryIsrc = isEditable && Boolean(onSavePrimaryIsrc);
  const metadataDraftRef = useRef({
    upc: release.upc ?? null,
    label: release.label ?? null,
  });

  useEffect(() => {
    metadataDraftRef.current = {
      upc: release.upc ?? null,
      label: release.label ?? null,
    };
  }, [release.label, release.upc]);

  return (
    <DrawerSurfaceCard
      variant={variant}
      className={cn(
        variant === 'card' && LINEAR_SURFACE.drawerCardSm,
        'overflow-hidden'
      )}
      testId='release-metadata-card'
    >
      <div className='p-3'>
        <div
          className={METADATA_STACK_CLASSNAME}
          data-testid='release-metadata-grid'
          data-dividers='false'
        >
          <DrawerPropertyRow
            {...METADATA_ROW_PROPS}
            className={METADATA_ROW_CLASSNAME}
            labelClassName={METADATA_LABEL_CLASSNAME}
            valueClassName={METADATA_VALUE_CLASSNAME}
            label='Type'
            value={<ReleaseTypeBadges release={release} />}
            align='start'
          />

          <DrawerPropertyRow
            {...METADATA_ROW_PROPS}
            className={METADATA_ROW_CLASSNAME}
            labelClassName={METADATA_LABEL_CLASSNAME}
            label='ISRC'
            value={
              <DrawerEditableTextField
                label='ISRC'
                value={release.primaryIsrc}
                editable={canEditPrimaryIsrc}
                placeholder='Add ISRC'
                emptyLabel='—'
                monospace
                normalizeValue={nextValue => {
                  const trimmed = nextValue.trim();
                  return trimmed
                    ? trimmed.replaceAll(/[^a-zA-Z0-9]/g, '').toUpperCase()
                    : null;
                }}
                onSave={
                  onSavePrimaryIsrc
                    ? nextValue => onSavePrimaryIsrc(release.id, nextValue)
                    : undefined
                }
                copyValue={release.primaryIsrc ?? null}
                displayClassName={METADATA_DISPLAY_VALUE_CLASSNAME}
                emptyClassName={METADATA_MUTED_TEXT_CLASSNAME}
                inputClassName={cn(
                  METADATA_INPUT_CLASSNAME,
                  'font-mono tracking-normal'
                )}
              />
            }
          />

          <DrawerPropertyRow
            {...METADATA_ROW_PROPS}
            className={METADATA_ROW_CLASSNAME}
            labelClassName={METADATA_LABEL_CLASSNAME}
            label='UPC'
            value={
              <DrawerEditableTextField
                label='UPC'
                value={release.upc}
                editable={canEditMetadata}
                placeholder='Add UPC'
                emptyLabel='—'
                monospace
                normalizeValue={nextValue => {
                  const trimmed = nextValue.trim();
                  return trimmed || null;
                }}
                onSave={
                  onSaveMetadata
                    ? async upc => {
                        metadataDraftRef.current = {
                          ...metadataDraftRef.current,
                          upc,
                        };
                        await onSaveMetadata(
                          release.id,
                          metadataDraftRef.current
                        );
                      }
                    : undefined
                }
                copyValue={release.upc ?? null}
                displayClassName={METADATA_DISPLAY_VALUE_CLASSNAME}
                emptyClassName={METADATA_MUTED_TEXT_CLASSNAME}
                inputClassName={cn(
                  METADATA_INPUT_CLASSNAME,
                  'font-mono tracking-normal'
                )}
              />
            }
          />

          <DrawerPropertyRow
            {...METADATA_ROW_PROPS}
            className={METADATA_ROW_CLASSNAME}
            labelClassName={METADATA_LABEL_CLASSNAME}
            label='Label'
            value={
              <DrawerEditableTextField
                label='Label'
                value={release.label}
                editable={canEditMetadata}
                placeholder='Add Label'
                emptyLabel='Unknown'
                normalizeValue={nextValue => {
                  const trimmed = nextValue.trim();
                  return trimmed || null;
                }}
                onSave={
                  onSaveMetadata
                    ? async label => {
                        metadataDraftRef.current = {
                          ...metadataDraftRef.current,
                          label,
                        };
                        await onSaveMetadata(
                          release.id,
                          metadataDraftRef.current
                        );
                      }
                    : undefined
                }
                copyValue={release.label ?? null}
                displayClassName={METADATA_DISPLAY_VALUE_CLASSNAME}
                emptyClassName={METADATA_MUTED_TEXT_CLASSNAME}
                inputClassName={METADATA_INPUT_CLASSNAME}
              />
            }
          />
          {release.copyrightLine && (
            <DrawerPropertyRow
              {...METADATA_ROW_PROPS}
              className={METADATA_ROW_CLASSNAME}
              labelClassName={METADATA_LABEL_CLASSNAME}
              valueClassName={METADATA_VALUE_CLASSNAME}
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

          <DrawerPropertyRow
            {...METADATA_ROW_PROPS}
            className={METADATA_ROW_CLASSNAME}
            labelClassName={METADATA_LABEL_CLASSNAME}
            label='Tracks'
            value={
              <span className='text-[11.5px] font-[460] tabular-nums text-primary-token'>
                {release.totalTracks}{' '}
                {release.totalTracks === 1 ? 'track' : 'tracks'}
              </span>
            }
          />
          {release.distributor && (
            <DrawerPropertyRow
              {...METADATA_ROW_PROPS}
              className={METADATA_ROW_CLASSNAME}
              labelClassName={METADATA_LABEL_CLASSNAME}
              valueClassName={METADATA_VALUE_CLASSNAME}
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
            className={METADATA_ROW_CLASSNAME}
            labelClassName={METADATA_LABEL_CLASSNAME}
            label='Canvas'
            value={
              onCanvasStatusChange ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <DrawerButton
                      tone='secondary'
                      size='sm'
                      className='-mx-0.5 h-5.5 gap-1 rounded-full border-subtle bg-surface-0 px-2 text-[10.5px] font-[510] leading-none text-secondary-token shadow-none hover:bg-surface-0'
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
                          <span className='flex w-full items-center gap-2'>
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

          {release.spotifyPopularity != null && (
            <DrawerPropertyRow
              {...METADATA_ROW_PROPS}
              className={METADATA_ROW_CLASSNAME}
              labelClassName={METADATA_LABEL_CLASSNAME}
              label='Popularity'
              value={<PopularityScore value={release.spotifyPopularity} />}
            />
          )}
          {release.totalDurationMs != null && release.totalDurationMs > 0 && (
            <DrawerPropertyRow
              {...METADATA_ROW_PROPS}
              className={METADATA_ROW_CLASSNAME}
              labelClassName={METADATA_LABEL_CLASSNAME}
              label='Duration'
              value={
                <span className='text-[11.5px] font-[460] tabular-nums text-primary-token'>
                  {formatDuration(release.totalDurationMs)}
                </span>
              }
            />
          )}

          <DrawerPropertyRow
            {...METADATA_ROW_PROPS}
            className={METADATA_ROW_CLASSNAME}
            labelClassName={METADATA_LABEL_CLASSNAME}
            valueClassName={METADATA_VALUE_CLASSNAME}
            label='Released'
            value={
              release.releaseDate ? (
                <span className={METADATA_TEXT_CLASSNAME}>
                  {new Date(release.releaseDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              ) : (
                <MetadataFallbackValue>Unknown</MetadataFallbackValue>
              )
            }
          />
          {release.genres && release.genres.length > 0 && (
            <DrawerPropertyRow
              {...METADATA_ROW_PROPS}
              className={METADATA_ROW_CLASSNAME}
              labelClassName={METADATA_LABEL_CLASSNAME}
              label='Genres'
              value={
                <div className='flex flex-wrap gap-1'>
                  {release.genres.slice(0, 3).map(genre => (
                    <Badge
                      key={genre}
                      variant='secondary'
                      className='rounded-full border border-subtle bg-surface-0 px-2 py-0 text-[9.5px] font-[510] tracking-normal text-secondary-token shadow-none'
                    >
                      {genre}
                    </Badge>
                  ))}
                </div>
              }
              align='start'
            />
          )}
        </div>
      </div>
    </DrawerSurfaceCard>
  );
}
