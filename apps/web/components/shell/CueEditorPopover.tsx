'use client';

import {
  AUDIO_CUE_KINDS,
  type AudioCueKind,
  type AudioTimelineDocumentV1,
  type AudioTimelineEdit,
} from '@jovie/audio-contracts';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import {
  CornerDownLeft,
  Flag,
  Pencil,
  Redo2,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { computeRatePercent } from '@/lib/analytics/metrics';
import { formatTime } from '@/lib/format-time';
import { cn } from '@/lib/utils';
import { Tooltip } from './Tooltip';

interface CueEditorPopoverProps {
  readonly timeline: AudioTimelineDocumentV1;
  readonly currentTime: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onEdit: (edit: AudioTimelineEdit) => boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onJump: (cueId: string) => void;
}

const ICON_BUTTON_CLASS =
  'relative grid h-8 w-8 shrink-0 place-items-center rounded-md text-quaternary-token transition-colors duration-subtle ease-subtle before:absolute before:-inset-1.5 before:content-[""] hover:bg-surface-2 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35';

function playheadSampleOffset(
  timeline: AudioTimelineDocumentV1,
  currentTime: number
): number {
  const seconds = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
  const rawOffset = Math.round(seconds * timeline.sampleRateHz);
  return timeline.durationSamples === null
    ? rawOffset
    : Math.min(rawOffset, timeline.durationSamples);
}

function createCueId(): string {
  return `cue_${globalThis.crypto.randomUUID().replaceAll('-', '').toLowerCase()}`;
}

function cueTime(
  cue: AudioTimelineDocumentV1['cues'][number],
  timeline: AudioTimelineDocumentV1
): number {
  return cue.sampleOffset / timeline.sampleRateHz;
}

function cueKindLabel(kind: AudioCueKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function CueEditorPopover({
  timeline,
  currentTime,
  canUndo,
  canRedo,
  onEdit,
  onUndo,
  onRedo,
  onJump,
}: CueEditorPopoverProps) {
  const [open, setOpen] = useState(false);
  const [editingCueId, setEditingCueId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [newCueKind, setNewCueKind] = useState<AudioCueKind>('custom');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const targetSampleOffset = playheadSampleOffset(timeline, currentTime);
  const durationSamples = timeline.durationSamples;
  const occupiedOffsets = useMemo(
    () => new Set<number>(timeline.cues.map(cue => cue.sampleOffset)),
    [timeline.cues]
  );
  const canAddAtPlayhead = !occupiedOffsets.has(targetSampleOffset);

  useEffect(() => {
    if (editingCueId) renameInputRef.current?.focus();
  }, [editingCueId]);

  const beginRename = (cueId: string, label: string) => {
    setEditingCueId(cueId);
    setDraftLabel(label);
  };

  const commitRename = () => {
    if (!editingCueId || draftLabel.trim().length === 0) return;
    if (
      onEdit({
        type: 'rename',
        cueId: editingCueId,
        label: draftLabel,
      })
    ) {
      setEditingCueId(null);
      setDraftLabel('');
    }
  };

  const addCue = () => {
    if (!canAddAtPlayhead) return;
    onEdit({
      type: 'add',
      cue: {
        id: createCueId(),
        kind: newCueKind,
        label: `${newCueKind === 'custom' ? 'Cue' : cueKindLabel(newCueKind)} ${timeline.cues.length + 1}`,
        sampleOffset: targetSampleOffset,
      },
    });
  };

  return (
    <Popover
      open={open}
      onOpenChange={nextOpen => {
        setOpen(nextOpen);
        if (!nextOpen) setEditingCueId(null);
      }}
    >
      <Tooltip label='Edit Cues' side='top'>
        <PopoverTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label='Edit Cues'
            aria-pressed={open}
            className={cn(
              'h-7 w-7 grid place-items-center rounded-md border border-transparent transition-[background-color,color,border-color,border-radius] duration-subtle ease-subtle focus-ring-themed hover:rounded-full hover:border-subtle',
              open
                ? 'rounded-full border-subtle bg-surface-1 text-primary-token'
                : 'text-quaternary-token hover:bg-surface-1 hover:text-primary-token'
            )}
          >
            <Flag className='h-3.5 w-3.5' strokeWidth={2.25} />
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent
        align='end'
        side='top'
        className='w-80 overflow-hidden p-0'
        testId='cue-editor-popover'
      >
        <div className='flex h-11 items-center justify-between border-b border-subtle px-3'>
          <span className='text-app font-caption text-primary-token'>Cues</span>
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              aria-label='Undo Cue Change'
              disabled={!canUndo}
              onClick={onUndo}
              className={ICON_BUTTON_CLASS}
            >
              <Undo2 className='h-3.5 w-3.5' />
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              aria-label='Redo Cue Change'
              disabled={!canRedo}
              onClick={onRedo}
              className={ICON_BUTTON_CLASS}
            >
              <Redo2 className='h-3.5 w-3.5' />
            </Button>
          </div>
        </div>

        <div className='flex h-11 items-center gap-2 border-b border-subtle px-3'>
          <select
            aria-label='New Cue Kind'
            value={newCueKind}
            onChange={event =>
              setNewCueKind(event.target.value as AudioCueKind)
            }
            className='h-8 min-w-0 flex-1 rounded-md border border-subtle bg-surface-0 px-2 text-xs text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          >
            {AUDIO_CUE_KINDS.map(kind => (
              <option key={kind} value={kind}>
                {cueKindLabel(kind)}
              </option>
            ))}
          </select>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={addCue}
            disabled={!canAddAtPlayhead}
            className='h-8 rounded-md border border-subtle bg-surface-1 px-3 text-xs font-caption text-primary-token transition-colors duration-subtle ease-subtle hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35'
          >
            Add At {formatTime(currentTime)}
          </Button>
        </div>

        <div className='relative h-1 bg-surface-0' aria-hidden='true'>
          {durationSamples !== null
            ? timeline.cues.map(cue => (
                <span
                  key={cue.id}
                  className='absolute inset-y-0 w-0.5 bg-primary-token'
                  style={{
                    left: `${Math.min(
                      100,
                      computeRatePercent(
                        cue.sampleOffset,
                        Math.max(1, durationSamples),
                        6
                      )
                    )}%`,
                  }}
                />
              ))
            : null}
        </div>

        <ul className='max-h-64 overflow-y-auto py-1'>
          {timeline.cues.length === 0 ? (
            <li className='flex h-11 items-center px-3 text-xs text-tertiary-token'>
              Add a cue at the playhead.
            </li>
          ) : (
            timeline.cues.map(cue => {
              const time = cueTime(cue, timeline);
              const moveBlocked = timeline.cues.some(candidate => {
                return (
                  candidate.id !== cue.id &&
                  candidate.sampleOffset === targetSampleOffset
                );
              });
              return (
                <li
                  key={cue.id}
                  className='flex min-h-11 items-center gap-1 px-2'
                >
                  {editingCueId === cue.id ? (
                    <form
                      onSubmit={event => {
                        event.preventDefault();
                        commitRename();
                      }}
                      className='flex min-w-0 flex-1 items-center gap-1'
                    >
                      <input
                        ref={renameInputRef}
                        aria-label={`Rename ${cue.label}`}
                        value={draftLabel}
                        maxLength={80}
                        onChange={event => setDraftLabel(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            event.stopPropagation();
                            setEditingCueId(null);
                          }
                        }}
                        className='h-8 min-w-0 flex-1 rounded-md border border-subtle bg-surface-0 px-2 text-xs text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                      />
                      <Button
                        type='submit'
                        variant='ghost'
                        size='icon'
                        aria-label='Save Cue Name'
                        className={ICON_BUTTON_CLASS}
                      >
                        <CornerDownLeft className='h-3.5 w-3.5' />
                      </Button>
                    </form>
                  ) : (
                    <>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        onClick={() => onJump(cue.id)}
                        className='min-w-0 flex-1 rounded-md px-2 py-1.5 text-left transition-colors duration-subtle ease-subtle hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                        aria-label={`Jump to ${cue.label} at ${formatTime(time)}`}
                      >
                        <span className='flex items-center justify-between gap-2'>
                          <span className='truncate text-xs text-primary-token'>
                            {cue.label}
                          </span>
                          <span className='shrink-0 text-3xs tabular-nums text-tertiary-token'>
                            {formatTime(time)}
                          </span>
                        </span>
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        aria-label={`Rename ${cue.label}`}
                        onClick={() => beginRename(cue.id, cue.label)}
                        className={ICON_BUTTON_CLASS}
                      >
                        <Pencil className='h-3.5 w-3.5' />
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        aria-label={`Move ${cue.label} to ${formatTime(currentTime)}`}
                        disabled={
                          moveBlocked || cue.sampleOffset === targetSampleOffset
                        }
                        onClick={() =>
                          onEdit({
                            type: 'move',
                            cueId: cue.id,
                            sampleOffset: targetSampleOffset,
                          })
                        }
                        className={ICON_BUTTON_CLASS}
                      >
                        <Flag className='h-3.5 w-3.5' />
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        aria-label={`Delete ${cue.label}`}
                        onClick={() =>
                          onEdit({ type: 'delete', cueId: cue.id })
                        }
                        className={ICON_BUTTON_CLASS}
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </Button>
                    </>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
