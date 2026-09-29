'use client';

import { Button } from '@jovie/ui';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertTriangle, Mic, Square, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createWebSpeechTranscriber,
  type Transcriber,
  type TranscriberErrorCode,
} from '@/lib/chat/transcriber';
import type {
  OvieCertificationDecisionKind,
  OvieCertificationRow,
} from '@/lib/ovie/certifications/types';
import {
  appendTranscriptSegment,
  buildWalkthroughNotes,
  type CertificationWalkthroughReview,
  createWalkthroughReview,
  formatPlaybackTime,
  isWalkthroughReviewStale,
  structureWalkthroughFindings,
  type WalkthroughPlaybackAnchor,
} from '@/lib/ovie/certifications/walkthrough';
import { cn } from '@/lib/utils';
import { shortSha } from './certification-view';

export const CERTIFICATION_WALKTHROUGH_SPEEDS = [1, 1.5, 2] as const;

interface CertificationWalkthroughProps {
  /** Live row so a newer evidence digest blocks certifying stale work. */
  readonly row: OvieCertificationRow | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDecide: (
    decision: OvieCertificationDecisionKind,
    notes: string | null
  ) => Promise<void>;
  readonly pendingDecision: OvieCertificationDecisionKind | null;
}

function dictationErrorMessage(code: TranscriberErrorCode): string {
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return 'Microphone access is off. Enable it to dictate.';
  }
  if (code === 'audio-capture') return 'No microphone was found.';
  if (code === 'no-speech' || code === 'aborted') return '';
  return 'Dictation stopped unexpectedly.';
}

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

export function CertificationWalkthrough({
  row,
  open,
  onOpenChange,
  onDecide,
  pendingDecision,
}: CertificationWalkthroughProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const transcriberRef = useRef<Transcriber | null>(null);
  const transcriptRef = useRef('');
  const [review, setReview] = useState<CertificationWalkthroughReview | null>(
    null
  );
  const [dictating, setDictating] = useState(false);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [finished, setFinished] = useState(false);

  // Open a fresh review bound to the row's digest at open time; reopening
  // after a new revision binds the new digest, never a stale one.
  useEffect(() => {
    if (open && row) {
      setReview(createWalkthroughReview(row));
      setFinished(false);
      setDictationError(null);
      transcriptRef.current = '';
    } else if (!open) {
      transcriberRef.current?.cancel();
      transcriberRef.current = null;
      setDictating(false);
      setReview(null);
      setFinished(false);
    }
  }, [open, row]);

  const playbackAnchor = useCallback((): WalkthroughPlaybackAnchor => {
    const video = videoRef.current;
    return {
      playbackSeconds: video?.currentTime ?? 0,
      playbackRate: video?.playbackRate ?? playbackRate,
      playerState: video ? (video.paused ? 'paused' : 'playing') : 'static',
      observedAt: new Date().toISOString(),
    };
  }, [playbackRate]);

  const commitDictation = useCallback(
    (fullTranscript: string) => {
      const previous = transcriptRef.current;
      transcriptRef.current = fullTranscript;
      const delta = fullTranscript.startsWith(previous)
        ? fullTranscript.slice(previous.length).trim()
        : fullTranscript.trim();
      if (delta.length === 0) return;
      setReview(current =>
        current
          ? appendTranscriptSegment(current, delta, playbackAnchor(), uuid())
          : current
      );
    },
    [playbackAnchor]
  );

  const stopDictation = useCallback(() => {
    transcriberRef.current?.stop();
    transcriberRef.current = null;
    setDictating(false);
  }, []);

  const startDictation = useCallback(() => {
    setDictationError(null);
    const transcriber = createWebSpeechTranscriber({
      onTranscript: commitDictation,
      onError: code => {
        const message = dictationErrorMessage(code);
        if (message) setDictationError(message);
        setDictating(false);
      },
      onEnd: () => setDictating(false),
    });
    if (!transcriber.isSupported) {
      setDictationError('Live dictation is not supported in this browser.');
      return;
    }
    transcriptRef.current = '';
    transcriberRef.current = transcriber;
    transcriber.start();
    setDictating(true);
  }, [commitDictation]);

  // Releasing the surface must never leave the microphone live.
  useEffect(
    () => () => {
      transcriberRef.current?.cancel();
      transcriberRef.current = null;
    },
    []
  );

  const findings = useMemo(
    () => (review ? structureWalkthroughFindings(review) : []),
    [review]
  );
  const stale = useMemo(
    () => (review ? isWalkthroughReviewStale(review, row) : false),
    [review, row]
  );
  const busy = pendingDecision !== null;

  const submitDecision = useCallback(
    async (decision: OvieCertificationDecisionKind) => {
      if (!review || stale) return;
      const notes =
        findings.length > 0 ? buildWalkthroughNotes(review, findings) : null;
      if (decision === 'changes_requested' && !notes) return;
      await onDecide(decision, notes);
      onOpenChange(false);
    },
    [review, stale, findings, onDecide, onOpenChange]
  );

  const artifact = review?.artifact ?? null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className='fixed inset-0 z-modal bg-black/52' />
        <DialogPrimitive.Content
          data-testid='certification-walkthrough'
          className='fixed inset-2 z-modal flex flex-col overflow-hidden rounded-(--system-b-radius-panel) border border-default bg-surface-elevated sm:inset-4'
        >
          <div className='flex min-w-0 items-center gap-2 border-b border-(--app-shell-frame-seam) px-4 py-2.5'>
            <DialogPrimitive.Title className='min-w-0 truncate text-sm font-medium text-primary-token'>
              {review?.subjectTitle ?? row?.subject.title ?? 'Walkthrough'}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className='min-w-0 flex-1 truncate text-2xs text-tertiary-token'>
              {row
                ? `${row.surface} · digest ${shortSha(review?.evidenceDigest ?? '')}`
                : ''}
            </DialogPrimitive.Description>
            <DialogPrimitive.Close asChild>
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                aria-label='Close Walkthrough'
              >
                <X className='h-3.5 w-3.5' aria-hidden='true' />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div className='flex min-h-0 flex-1'>
            <div className='flex min-w-0 flex-1 flex-col bg-black/90'>
              <div className='flex min-h-0 flex-1 items-center justify-center p-4'>
                {artifact?.kind === 'video' && artifact.href ? (
                  // biome-ignore lint/a11y/useMediaCaption: machine-generated proof artifacts carry no caption tracks; dictation is the review surface
                  <video
                    ref={videoRef}
                    src={artifact.href}
                    controls
                    className='max-h-full max-w-full'
                    data-testid='walkthrough-video'
                    onRateChange={event =>
                      setPlaybackRate(event.currentTarget.playbackRate)
                    }
                  />
                ) : artifact?.kind === 'image' && artifact.href ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote proof artifact URL, no optimization
                  <img
                    src={artifact.href}
                    alt={artifact.label}
                    className='max-h-full max-w-full object-contain'
                    data-testid='walkthrough-image'
                  />
                ) : (
                  <div
                    className='max-w-prose space-y-2 text-center'
                    data-testid='walkthrough-receipt'
                  >
                    <p className='text-sm text-primary-token'>
                      {artifact?.label ?? 'No playable evidence'}
                    </p>
                    <p className='break-all text-2xs text-tertiary-token'>
                      {artifact?.ref}
                    </p>
                  </div>
                )}
              </div>
              {artifact?.kind === 'video' ? (
                <div
                  className='flex items-center justify-center gap-1 border-t border-white/10 py-1.5'
                  role='toolbar'
                  aria-label='Review Speed'
                >
                  {CERTIFICATION_WALKTHROUGH_SPEEDS.map(speed => (
                    <Button
                      key={speed}
                      type='button'
                      size='sm'
                      variant={playbackRate === speed ? 'secondary' : 'ghost'}
                      onClick={() => {
                        if (videoRef.current)
                          videoRef.current.playbackRate = speed;
                        setPlaybackRate(speed);
                      }}
                    >
                      {speed}×
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>

            <aside className='flex w-80 shrink-0 flex-col border-l border-(--app-shell-frame-seam)'>
              <div className='border-b border-(--app-shell-frame-seam) p-3'>
                <Button
                  type='button'
                  size='sm'
                  variant={dictating ? 'secondary' : 'primary'}
                  className='w-full'
                  data-testid='walkthrough-dictate'
                  onClick={() =>
                    dictating ? stopDictation() : startDictation()
                  }
                >
                  {dictating ? (
                    <>
                      <Square className='h-3.5 w-3.5' aria-hidden='true' /> Stop
                      Dictation
                    </>
                  ) : (
                    <>
                      <Mic className='h-3.5 w-3.5' aria-hidden='true' /> Dictate
                    </>
                  )}
                </Button>
                <p
                  role='status'
                  aria-live='polite'
                  className='mt-1.5 min-h-4 text-2xs leading-4 text-error'
                >
                  {dictationError}
                </p>
              </div>

              <ol
                className='min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3'
                data-testid='walkthrough-segments'
              >
                {(finished ? findings : (review?.segments ?? [])).map(item => {
                  const isFinding = 'segmentIds' in item;
                  const seconds = isFinding
                    ? item.playbackSeconds
                    : item.anchor.playbackSeconds;
                  const text = item.text;
                  const key = isFinding ? item.id : item.id;
                  return (
                    <li
                      key={key}
                      className='rounded-md border border-subtle px-2 py-1.5'
                    >
                      <span className='text-2xs tabular-nums text-tertiary-token'>
                        {formatPlaybackTime(seconds)}
                        {isFinding && item.ambiguous ? ' · ambiguous' : ''}
                      </span>
                      <p className='text-xs leading-4 text-secondary-token'>
                        {text}
                      </p>
                    </li>
                  );
                })}
                {(review?.segments.length ?? 0) === 0 ? (
                  <li className='text-xs text-quaternary-token'>
                    Dictate while the proof plays; every comment is anchored to
                    the playback moment you were watching.
                  </li>
                ) : null}
              </ol>

              <div className='space-y-2 border-t border-(--app-shell-frame-seam) p-3'>
                {stale ? (
                  <p
                    className='flex items-start gap-1.5 text-2xs leading-4 text-warning'
                    data-testid='walkthrough-stale'
                  >
                    <AlertTriangle
                      className='mt-0.5 h-3 w-3 shrink-0'
                      aria-hidden='true'
                    />
                    This evidence was superseded during review. Your comments
                    are kept, but certification requires refreshed evidence.
                  </p>
                ) : null}
                {!finished ? (
                  <Button
                    type='button'
                    size='sm'
                    variant='secondary'
                    className='w-full'
                    disabled={(review?.segments.length ?? 0) === 0}
                    onClick={() => {
                      stopDictation();
                      setFinished(true);
                    }}
                  >
                    End Review
                  </Button>
                ) : (
                  <div className='flex flex-col gap-1.5'>
                    <Button
                      type='button'
                      size='sm'
                      variant='secondary'
                      loading={pendingDecision === 'changes_requested'}
                      disabled={busy || stale || findings.length === 0}
                      onClick={() => void submitDecision('changes_requested')}
                    >
                      Request Changes ({findings.length})
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      onClick={() => setFinished(false)}
                    >
                      Back To Review
                    </Button>
                  </div>
                )}
                <Button
                  type='button'
                  size='sm'
                  variant='primary'
                  className={cn('w-full', finished && 'order-first')}
                  loading={pendingDecision === 'approved'}
                  disabled={busy || stale}
                  onClick={() => void submitDecision('approved')}
                >
                  Certify
                </Button>
              </div>
            </aside>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
