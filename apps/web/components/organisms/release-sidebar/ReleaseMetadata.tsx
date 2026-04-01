'use client';

import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  SimpleTooltip,
} from '@jovie/ui';
import { Check, ChevronDown, Info, Loader2 } from 'lucide-react';
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { CopyableMonospaceCell } from '@/components/atoms/CopyableMonospaceCell';

import {
  DrawerButton,
  DrawerPropertyRow,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
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
  labelWidth: 74,
  size: 'sm' as const,
};
const METADATA_TEXT_CLASSNAME =
  'text-[12px] font-[460] leading-[16px] text-secondary-token';
const METADATA_MUTED_TEXT_CLASSNAME =
  'text-[11px] leading-[15px] text-tertiary-token';
const METADATA_LABEL_CLASSNAME =
  'text-[10px] font-[500] leading-[13px] tracking-[0.01em] text-quaternary-token';
const METADATA_VALUE_CLASSNAME =
  'text-[12px] leading-[16px] text-secondary-token';
const METADATA_BADGE_CLASSNAME =
  'h-5 rounded-full border border-subtle bg-surface-0 px-2 text-[9.5px] font-[510] tracking-[-0.01em] shadow-none';
const METADATA_ROW_CLASSNAME = 'rounded-none px-0 py-1 first:pt-0 last:pb-0';
const METADATA_STACK_CLASSNAME = 'space-y-0.5';
const METADATA_COPY_CELL_CLASSNAME =
  'h-5.5 rounded-full px-1.5 text-[10.5px] leading-none tracking-[0.02em]';
const METADATA_COPY_TEXT_CELL_CLASSNAME =
  'h-5.5 rounded-full px-1.5 text-[10.5px] font-[460] leading-none';
const METADATA_INPUT_CLASSNAME =
  'h-7 rounded-full border-subtle bg-surface-0 px-2.5 text-[11px] font-[460] text-primary-token shadow-none';
const AUTO_SAVE_DELAY_MS = 1500;

type SaveStatus = 'idle' | 'saving' | 'saved';

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
          className='h-5 rounded-full border border-transparent bg-red-500/10 px-2 text-[9.5px] font-[510] tracking-[-0.01em] text-red-600 shadow-none dark:text-red-300'
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

interface EditableMetadataFieldProps {
  readonly releaseId: string;
  readonly label: string;
  readonly value: string | null | undefined;
  readonly placeholder: string;
  readonly monospace?: boolean;
  readonly normalizeValue: (value: string) => string | null;
  readonly onSave: (releaseId: string, value: string | null) => Promise<void>;
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

function EditableMetadataField({
  releaseId,
  label,
  value,
  placeholder,
  monospace = false,
  normalizeValue,
  onSave,
}: EditableMetadataFieldProps) {
  const [draft, setDraft] = useState(value ?? '');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const draftRef = useRef(draft);
  const valueRef = useRef(value ?? '');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  draftRef.current = draft;
  valueRef.current = value ?? '';

  useEffect(() => {
    setDraft(value ?? '');
    setSaveStatus('idle');
    setErrorMessage(null);
  }, [value, releaseId]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savedIndicatorTimerRef.current) {
        clearTimeout(savedIndicatorTimerRef.current);
      }
    };
  }, []);

  const performSave = useCallback(async () => {
    const draftSnapshot = draftRef.current;
    const nextValue = normalizeValue(draftSnapshot);
    const currentValue = normalizeValue(valueRef.current);

    if (nextValue === currentValue) {
      setSaveStatus('idle');
      setErrorMessage(null);
      return;
    }

    setSaveStatus('saving');
    setErrorMessage(null);

    try {
      await onSave(releaseId, nextValue);

      if (draftRef.current !== draftSnapshot) {
        setSaveStatus('idle');
        return;
      }

      setSaveStatus('saved');
      if (savedIndicatorTimerRef.current) {
        clearTimeout(savedIndicatorTimerRef.current);
      }
      savedIndicatorTimerRef.current = setTimeout(
        () => setSaveStatus('idle'),
        2000
      );
    } catch (error) {
      setSaveStatus('idle');
      setErrorMessage(
        error instanceof Error ? error.message : `Failed to save ${label}`
      );
    }
  }, [label, normalizeValue, onSave, releaseId]);

  useEffect(() => {
    const nextValue = normalizeValue(draft);
    const currentValue = normalizeValue(value ?? '');
    if (nextValue === currentValue) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      startTransition(() => {
        void performSave();
      });
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [draft, normalizeValue, performSave, value]);

  const handleBlur = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void performSave();
  }, [performSave]);

  return (
    <div className='min-w-0 space-y-1'>
      <Input
        value={draft}
        onChange={event => {
          setDraft(event.target.value);
          setErrorMessage(null);
          if (saveStatus === 'saved') {
            setSaveStatus('idle');
          }
        }}
        onBlur={handleBlur}
        placeholder={placeholder}
        aria-label={label}
        className={cn(
          METADATA_INPUT_CLASSNAME,
          monospace && 'font-mono tracking-[0.02em]',
          errorMessage && 'border-destructive text-destructive'
        )}
      />
      {(saveStatus !== 'idle' || errorMessage) && (
        <div className='flex min-h-4 items-center gap-1 text-[10px] leading-none'>
          {saveStatus === 'saving' && (
            <>
              <Loader2 className='h-3 w-3 animate-spin text-tertiary-token' />
              <span className='text-tertiary-token'>Saving…</span>
            </>
          )}
          {saveStatus === 'saved' && !errorMessage && (
            <>
              <Check className='h-3 w-3 text-success' />
              <span className='text-tertiary-token'>Saved</span>
            </>
          )}
          {errorMessage && (
            <span className='text-[10px] text-destructive'>{errorMessage}</span>
          )}
        </div>
      )}
    </div>
  );
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
    canvasStatus === 'generated' ? 'not_set' : canvasStatus;
  const canvasStatusConfig =
    CANVAS_STATUS_CONFIG[canvasStatus] ?? CANVAS_STATUS_CONFIG.not_set;
  const canvasStatusDisplayLabel =
    canvasStatusConfig.displayLabel ?? canvasStatusConfig.label;
  const canEditMetadata = isEditable && Boolean(onSaveMetadata);
  const canEditPrimaryIsrc = isEditable && Boolean(onSavePrimaryIsrc);

  return (
    <DrawerSurfaceCard
      variant={variant}
      className={cn(
        variant === 'card' && LINEAR_SURFACE.drawerCardSm,
        'overflow-hidden border-0'
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
              canEditPrimaryIsrc && onSavePrimaryIsrc ? (
                <EditableMetadataField
                  releaseId={release.id}
                  label='ISRC'
                  value={release.primaryIsrc}
                  placeholder='Add ISRC'
                  monospace
                  normalizeValue={value => {
                    const trimmed = value.trim();
                    return trimmed
                      ? trimmed.replaceAll(/[^a-zA-Z0-9]/g, '').toUpperCase()
                      : null;
                  }}
                  onSave={onSavePrimaryIsrc}
                />
              ) : (
                <CopyableMonospaceCell
                  value={release.primaryIsrc}
                  label='ISRC'
                  size='sm'
                  maxWidth={140}
                  className={METADATA_COPY_CELL_CLASSNAME}
                />
              )
            }
          />

          <DrawerPropertyRow
            {...METADATA_ROW_PROPS}
            className={METADATA_ROW_CLASSNAME}
            labelClassName={METADATA_LABEL_CLASSNAME}
            label='UPC'
            value={
              canEditMetadata && onSaveMetadata ? (
                <EditableMetadataField
                  releaseId={release.id}
                  label='UPC'
                  value={release.upc}
                  placeholder='Add UPC'
                  monospace
                  normalizeValue={value => {
                    const trimmed = value.trim();
                    return trimmed ? trimmed : null;
                  }}
                  onSave={async (releaseId, upc) =>
                    onSaveMetadata(releaseId, {
                      upc,
                      label: release.label ?? null,
                    })
                  }
                />
              ) : (
                <CopyableMonospaceCell
                  value={release.upc}
                  label='UPC'
                  size='sm'
                  maxWidth={140}
                  className={METADATA_COPY_CELL_CLASSNAME}
                />
              )
            }
          />

          <DrawerPropertyRow
            {...METADATA_ROW_PROPS}
            className={METADATA_ROW_CLASSNAME}
            labelClassName={METADATA_LABEL_CLASSNAME}
            label='Label'
            value={
              canEditMetadata && onSaveMetadata ? (
                <EditableMetadataField
                  releaseId={release.id}
                  label='Label'
                  value={release.label}
                  placeholder='Add Label'
                  normalizeValue={value => {
                    const trimmed = value.trim();
                    return trimmed ? trimmed : null;
                  }}
                  onSave={async (releaseId, label) =>
                    onSaveMetadata(releaseId, {
                      upc: release.upc ?? null,
                      label,
                    })
                  }
                />
              ) : release.label ? (
                <CopyableMonospaceCell
                  value={release.label}
                  label='Label'
                  size='sm'
                  maxWidth={140}
                  className={cn(
                    METADATA_COPY_TEXT_CELL_CLASSNAME,
                    'font-sans tracking-normal'
                  )}
                />
              ) : (
                <MetadataFallbackValue>Unknown</MetadataFallbackValue>
              )
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
                      className='rounded-full border border-subtle bg-surface-0 px-2 py-0 text-[9.5px] font-[510] tracking-[-0.01em] text-secondary-token shadow-none'
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
