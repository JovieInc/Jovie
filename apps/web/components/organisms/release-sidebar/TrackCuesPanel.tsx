'use client';

import {
  type AudioTimelineDocumentV1,
  createAudioTimelineDocument,
} from '@jovie/audio-contracts';
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Play,
  Plus,
  Redo2,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from '@/components/feedback';
import { formatTime } from '@/lib/format-time';
import { cn } from '@/lib/utils';
import {
  loadTrackCueTimelineAction,
  saveTrackCueTimelineAction,
} from './track-cues-action';
import { useTrackAudioPlayer } from './useTrackAudioPlayer';

/** Sample rate used for cue timelines created before real media decode. */
const DEFAULT_SAMPLE_RATE_HZ = 48_000;
/** Keyboard nudge granularity for cue moves (Arrow keys on a focused row). */
const NUDGE_SECONDS = 1;

const ICON_BUTTON_CLASS =
  'grid h-7 w-7 shrink-0 place-items-center rounded-md text-quaternary-token transition-colors duration-subtle ease-subtle hover:bg-surface-2 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 disabled:pointer-events-none disabled:opacity-35';

export interface TrackCuesPanelProps {
  readonly trackId: string;
  readonly durationMs: number | null;
}

function createCueId(): string {
  return `cue_${globalThis.crypto.randomUUID().replaceAll('-', '').toLowerCase()}`;
}

function cueTimeSeconds(
  cue: AudioTimelineDocumentV1['cues'][number],
  timeline: AudioTimelineDocumentV1
): number {
  return cue.sampleOffset / timeline.sampleRateHz;
}

/**
 * Cue editing surface for the shared entity right rail. Loads the persisted
 * canonical cue timeline, keeps edit history in the single
 * `useTrackAudioPlayer` authority, and persists every committed document
 * through `saveTrackCueTimelineAction`.
 *
 * Keyboard contract (on a focused cue row):
 * - Enter / Space — jump the playhead to the cue
 * - ArrowLeft / ArrowRight — move the cue by one second
 * - F2 — rename inline (Enter commits, Escape cancels)
 * - Delete / Backspace — remove the cue
 * Panel-level: Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z redo.
 */
export function TrackCuesPanel({ trackId, durationMs }: TrackCuesPanelProps) {
  const {
    playbackState,
    adoptTimeline,
    applyTimelineEdit,
    undoTimelineEdit,
    redoTimelineEdit,
    jumpToCuePoint,
  } = useTrackAudioPlayer();

  const [loading, setLoading] = useState(true);
  const [editingCueId, setEditingCueId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** Revision the server last acknowledged — optimistic-concurrency base. */
  const savedRevisionRef = useRef(0);

  const timeline =
    playbackState.timeline?.trackId === trackId
      ? playbackState.timeline
      : null;

  // Load (or create) the canonical timeline document for this track.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadTrackCueTimelineAction(trackId)
      .then(persisted => {
        if (cancelled) return;
        const document =
          persisted ??
          createAudioTimelineDocument({
            trackId,
            revision: 0,
            sampleRateHz: DEFAULT_SAMPLE_RATE_HZ,
            durationSamples:
              durationMs === null
                ? null
                : Math.round((durationMs / 1000) * DEFAULT_SAMPLE_RATE_HZ),
            cues: [],
            beatGrid: null,
          });
        savedRevisionRef.current = document.revision;
        adoptTimeline(document);
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load cues');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trackId, durationMs, adoptTimeline]);

  useEffect(() => {
    if (editingCueId) renameInputRef.current?.focus();
  }, [editingCueId]);

  const persist = useCallback(
    (document: AudioTimelineDocumentV1) => {
      void saveTrackCueTimelineAction({
        trackId,
        timeline: document,
        baseRevision: savedRevisionRef.current,
      }).then(result => {
        if (result.ok) {
          savedRevisionRef.current = document.revision;
          return;
        }
        if (result.reason === 'conflict' && result.timeline) {
          savedRevisionRef.current = result.timeline.revision;
          adoptTimeline(result.timeline);
          toast.error('Cues changed elsewhere — reloaded latest');
        } else {
          toast.error('Could not save cues');
        }
      });
    },
    [trackId, adoptTimeline]
  );

  const commitEdit = useCallback(
    (edit: Parameters<typeof applyTimelineEdit>[0]) => {
      const next = applyTimelineEdit(edit);
      if (next) persist(next);
      return next;
    },
    [applyTimelineEdit, persist]
  );

  const handleUndo = useCallback(() => {
    const next = undoTimelineEdit();
    if (next) persist(next);
  }, [undoTimelineEdit, persist]);

  const handleRedo = useCallback(() => {
    const next = redoTimelineEdit();
    if (next) persist(next);
  }, [redoTimelineEdit, persist]);

  const occupiedOffsets = useMemo(
    () => new Set<number>(timeline?.cues.map(cue => cue.sampleOffset) ?? []),
    [timeline]
  );

  const playheadSeconds =
    playbackState.activeTrackId === trackId ? playbackState.currentTime : 0;
  const targetSampleOffset = timeline
    ? Math.round(Math.max(0, playheadSeconds) * timeline.sampleRateHz)
    : 0;
  const canAddAtPlayhead = !occupiedOffsets.has(targetSampleOffset);

  const handleJump = useCallback(
    (cueId: string) => {
      jumpToCuePoint(cueId);
    },
    [jumpToCuePoint]
  );

  const handleAdd = useCallback(() => {
    if (!timeline || !canAddAtPlayhead) return;
    commitEdit({
      type: 'add',
      cue: {
        id: createCueId(),
        kind: 'custom',
        label: `Cue ${timeline.cues.length + 1}`,
        sampleOffset: targetSampleOffset,
      },
    });
  }, [timeline, canAddAtPlayhead, targetSampleOffset, commitEdit]);

  const beginRename = useCallback((cueId: string, label: string) => {
    setEditingCueId(cueId);
    setDraftLabel(label);
  }, []);

  const commitRename = useCallback(() => {
    if (!editingCueId || draftLabel.trim().length === 0) return;
    if (commitEdit({ type: 'rename', cueId: editingCueId, label: draftLabel })) {
      setEditingCueId(null);
      setDraftLabel('');
    }
  }, [editingCueId, draftLabel, commitEdit]);

  const moveCue = useCallback(
    (cueId: string, deltaSeconds: number) => {
      if (!timeline) return;
      const cue = timeline.cues.find(c => c.id === cueId);
      if (!cue) return;
      const delta = Math.round(deltaSeconds * timeline.sampleRateHz);
      const nextOffset = Math.max(0, cue.sampleOffset + delta);
      if (occupiedOffsets.has(nextOffset)) return;
      commitEdit({ type: 'move', cueId, sampleOffset: nextOffset });
    },
    [timeline, occupiedOffsets, commitEdit]
  );

  const deleteCue = useCallback(
    (cueId: string) => {
      if (editingCueId === cueId) setEditingCueId(null);
      commitEdit({ type: 'delete', cueId });
    },
    [editingCueId, commitEdit]
  );

  const handlePanelKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      if (event.shiftKey) handleRedo();
      else handleUndo();
    },
    [handleUndo, handleRedo]
  );

  const handleRowKeyDown = useCallback(
    (event: KeyboardEvent, cueId: string) => {
      if (editingCueId) return;
      switch (event.key) {
        case 'Enter':
        case ' ':
          event.preventDefault();
          handleJump(cueId);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          moveCue(cueId, -NUDGE_SECONDS);
          break;
        case 'ArrowRight':
          event.preventDefault();
          moveCue(cueId, NUDGE_SECONDS);
          break;
        case 'F2': {
          event.preventDefault();
          const cue = timeline?.cues.find(c => c.id === cueId);
          if (cue) beginRename(cueId, cue.label);
          break;
        }
        case 'Delete':
        case 'Backspace':
          event.preventDefault();
          deleteCue(cueId);
          // Deleting the focused row drops focus to <body>; hand it to the
          // panel so undo/redo shortcuts keep working.
          panelRef.current?.focus();
          break;
        default:
          break;
      }
    },
    [editingCueId, handleJump, moveCue, deleteCue, beginRename, timeline]
  );

  if (loading) {
    return (
      <div className='px-4 py-4 text-3xs text-tertiary-token'>
        Loading cues…
      </div>
    );
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: panel-scoped undo/redo shortcut region
    <div
      ref={panelRef}
      // Focusable so keyboard undo/redo still work after a row action
      // removes the previously focused element.
      tabIndex={-1}
      className='px-4 py-4 outline-none'
      onKeyDown={handlePanelKeyDown}
    >
      <div className='flex items-center justify-between pb-2'>
        <p className='text-3xs font-caption uppercase tracking-wider text-quaternary-token'>
          Cues
        </p>
        <div className='flex items-center gap-1'>
          <button
            type='button'
            aria-label='Add cue at playhead'
            title='Add cue at playhead'
            onClick={handleAdd}
            disabled={!timeline || !canAddAtPlayhead}
            className={ICON_BUTTON_CLASS}
          >
            <Plus className='h-3.5 w-3.5' />
          </button>
          <button
            type='button'
            aria-label='Undo cue edit'
            title='Undo (Cmd/Ctrl+Z)'
            onClick={handleUndo}
            disabled={!playbackState.canUndoTimelineEdit}
            className={ICON_BUTTON_CLASS}
          >
            <Undo2 className='h-3.5 w-3.5' />
          </button>
          <button
            type='button'
            aria-label='Redo cue edit'
            title='Redo (Cmd/Ctrl+Shift+Z)'
            onClick={handleRedo}
            disabled={!playbackState.canRedoTimelineEdit}
            className={ICON_BUTTON_CLASS}
          >
            <Redo2 className='h-3.5 w-3.5' />
          </button>
        </div>
      </div>

      {!timeline || timeline.cues.length === 0 ? (
        <p className='text-3xs text-tertiary-token'>
          No cues yet. Play the track and press + to drop one at the playhead.
        </p>
      ) : (
        <ul className='-mx-2 flex flex-col'>
          {timeline.cues.map(cue => (
            <li key={cue.id}>
              {editingCueId === cue.id ? (
                <form
                  className='flex items-center gap-2 px-2 py-0.5'
                  onSubmit={event => {
                    event.preventDefault();
                    commitRename();
                  }}
                >
                  <input
                    ref={renameInputRef}
                    value={draftLabel}
                    onChange={event => setDraftLabel(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setEditingCueId(null);
                        setDraftLabel('');
                      }
                    }}
                    onBlur={commitRename}
                    aria-label='Cue label'
                    className='h-7 flex-1 rounded-md bg-surface-1 px-2 text-xs text-primary-token outline-none ring-1 ring-ring/55'
                  />
                </form>
              ) : (
                <div
                  role='button'
                  tabIndex={0}
                  aria-label={`Cue ${cue.label} at ${formatTime(cueTimeSeconds(cue, timeline))}`}
                  onClick={() => handleJump(cue.id)}
                  onKeyDown={event => handleRowKeyDown(event, cue.id)}
                  className={cn(
                    'group/cue flex w-full cursor-pointer items-center gap-1 rounded-md px-2 h-8 text-xs text-secondary-token',
                    'hover:bg-surface-1/40 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55'
                  )}
                >
                  <span className='w-9 shrink-0 text-left tabular-nums text-3xs text-quaternary-token'>
                    {formatTime(cueTimeSeconds(cue, timeline))}
                  </span>
                  <span className='flex-1 truncate text-left'>{cue.label}</span>
                  <span className='flex items-center opacity-0 transition-opacity duration-subtle ease-subtle group-hover/cue:opacity-100 group-focus-within/cue:opacity-100'>
                    <button
                      type='button'
                      aria-label={`Play from ${cue.label}`}
                      onClick={event => {
                        event.stopPropagation();
                        handleJump(cue.id);
                      }}
                      className={ICON_BUTTON_CLASS}
                    >
                      <Play className='h-3 w-3' fill='currentColor' />
                    </button>
                    <button
                      type='button'
                      aria-label={`Nudge ${cue.label} earlier`}
                      onClick={event => {
                        event.stopPropagation();
                        moveCue(cue.id, -NUDGE_SECONDS);
                      }}
                      className={ICON_BUTTON_CLASS}
                    >
                      <ChevronLeft className='h-3.5 w-3.5' />
                    </button>
                    <button
                      type='button'
                      aria-label={`Nudge ${cue.label} later`}
                      onClick={event => {
                        event.stopPropagation();
                        moveCue(cue.id, NUDGE_SECONDS);
                      }}
                      className={ICON_BUTTON_CLASS}
                    >
                      <ChevronRight className='h-3.5 w-3.5' />
                    </button>
                    <button
                      type='button'
                      aria-label={`Rename ${cue.label}`}
                      onClick={event => {
                        event.stopPropagation();
                        beginRename(cue.id, cue.label);
                      }}
                      className={ICON_BUTTON_CLASS}
                    >
                      <Pencil className='h-3 w-3' />
                    </button>
                    <button
                      type='button'
                      aria-label={`Delete ${cue.label}`}
                      onClick={event => {
                        event.stopPropagation();
                        deleteCue(cue.id);
                      }}
                      className={ICON_BUTTON_CLASS}
                    >
                      <Trash2 className='h-3 w-3' />
                    </button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
