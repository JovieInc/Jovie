'use client';

import { Button } from '@jovie/ui';
import { Circle, Square } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { toast } from '@/components/feedback';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { useAuthSafe } from '@/hooks/useJovieAuth';
import {
  canRecordScreen,
  type ScreenRecordingSession,
  startScreenRecording,
} from '@/lib/capture/record-screen';
import { uploadAccountVideo } from '@/lib/capture/upload-account-video';
import { FOUNDER_WALK_CONFIRM_PATH } from '@/lib/hud/founder-walk';

type WalkPhase = 'idle' | 'selecting' | 'recording' | 'uploading';
type WalkAttempt = {
  owner: string;
  url: string;
  controller: AbortController;
  session?: ScreenRecordingSession;
  uploading: boolean;
};

function recordingPageUrl(): string {
  const url = new URL(globalThis.location.href);
  // An in-page anchor does not change the document/account capture context.
  // Next hash-only pushState does not publish a route or query change.
  url.hash = '';
  return url.href;
}

export function FounderMorningWalkCard(props: {
  readonly defaultStatus: string;
  /** Render as a single action row for the cockpit utility strip. */
  readonly compact?: boolean;
}) {
  const { userId } = useAuthSafe();
  const pathname = usePathname();
  const query = useSearchParams()?.toString() ?? '';
  const [phase, setPhase] = useState<WalkPhase>('idle');
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const attemptRef = useRef<WalkAttempt | null>(null);

  const discard = useCallback(() => {
    const attempt = attemptRef.current;
    attemptRef.current = null;
    attempt?.controller.abort();
    attempt?.session?.cancel();
  }, []);
  useLayoutEffect(() => {
    const documentUrl = recordingPageUrl();
    setPhase('idle');
    setLastUrl(null);
    const reset = () => {
      discard();
      setPhase('idle');
      setLastUrl(null);
    };
    const onPopstate = () => {
      const contextUrl = attemptRef.current?.url ?? documentUrl;
      if (recordingPageUrl() !== contextUrl) reset();
    };
    // Leaving the document or capture context invalidates permanently, even
    // if navigation returns. Fragment-only history keeps the same context.
    globalThis.addEventListener('pagehide', reset);
    globalThis.addEventListener('popstate', onPopstate);
    return () => {
      discard();
      globalThis.removeEventListener('pagehide', reset);
      globalThis.removeEventListener('popstate', onPopstate);
    };
  }, [userId, pathname, query, discard]);

  const isCurrent = (attempt: WalkAttempt) =>
    attemptRef.current === attempt &&
    !attempt.controller.signal.aborted &&
    recordingPageUrl() === attempt.url;

  const startRecording = async () => {
    if (attemptRef.current || !userId) return;
    if (!canRecordScreen()) {
      toast.error('Screen recording is not available in this window.');
      return;
    }
    const attempt: WalkAttempt = {
      owner: userId,
      url: recordingPageUrl(),
      controller: new AbortController(),
      uploading: false,
    };
    attemptRef.current = attempt;
    setPhase('selecting');
    try {
      const session = await startScreenRecording('founder_walk', {
        signal: attempt.controller.signal,
        isCurrent: () => isCurrent(attempt),
      });
      if (!isCurrent(attempt)) {
        session.cancel();
        if (attemptRef.current === attempt) {
          discard();
          setPhase('idle');
        }
        return;
      }
      attempt.session = session;
      setPhase('recording');
    } catch {
      if (isCurrent(attempt))
        toast.error('Screen recording is unavailable, blocked or cancelled.');
      if (attemptRef.current === attempt) {
        discard();
        setPhase('idle');
      }
    }
  };

  const stopRecording = async () => {
    const attempt = attemptRef.current;
    if (!attempt?.session || attempt.uploading) return;
    if (!isCurrent(attempt)) {
      discard();
      setPhase('idle');
      return;
    }
    attempt.uploading = true;
    setPhase('uploading');
    try {
      const recording = await attempt.session.stop();
      if (!isCurrent(attempt)) return;
      const uploaded = await uploadAccountVideo(recording.file, attempt.owner);
      if (!isCurrent(attempt)) return;
      const confirm = await fetch(FOUNDER_WALK_CONFIRM_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: attempt.controller.signal,
        body: JSON.stringify({
          blobUrl: uploaded.url,
          durationMs: recording.durationMs,
          byteSize: recording.byteSize,
        }),
      });
      if (!isCurrent(attempt)) return;
      if (!confirm.ok) throw new Error('Walk confirm failed');
      setLastUrl(uploaded.url);
      toast.success('Walk stored. Nothing admitted until it is classified.');
    } catch {
      if (isCurrent(attempt))
        toast.error('Could not store the walk. Try again.');
    } finally {
      if (attemptRef.current === attempt) {
        discard();
        setPhase('idle');
      }
    }
  };
  const primaryAction = () => {
    if (phase === 'selecting') {
      discard();
      setPhase('idle');
    } else void startRecording();
  };
  const recordLabel =
    phase === 'selecting'
      ? 'Cancel selection'
      : phase === 'uploading'
        ? 'Storing…'
        : 'Record walk';

  if (props.compact) {
    return (
      <div
        className='flex items-center gap-2'
        data-testid='founder-morning-walk'
      >
        {phase === 'recording' ? (
          <Button
            type='button'
            size='sm'
            variant='secondary'
            onClick={() => void stopRecording()}
          >
            <Square className='h-3.5 w-3.5' aria-hidden='true' />
            Stop Walk
          </Button>
        ) : (
          <Button
            type='button'
            size='sm'
            variant='secondary'
            onClick={primaryAction}
            disabled={phase === 'uploading' || !userId}
            title={props.defaultStatus}
          >
            <Circle className='h-3.5 w-3.5 fill-current' aria-hidden='true' />
            {recordLabel}
          </Button>
        )}
        {lastUrl ? (
          <a
            href={lastUrl}
            className='truncate text-2xs text-secondary-token underline'
            target='_blank'
            rel='noreferrer'
          >
            Last walk
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <ContentSurfaceCard className='p-3' data-testid='founder-morning-walk'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0 space-y-1'>
          <p className='text-2xs font-medium uppercase tracking-[0.08em] text-tertiary-token'>
            Morning walk
          </p>
          <p className='text-sm text-primary-token'>{props.defaultStatus}</p>
          <p className='text-xs text-secondary-token'>
            Record the web path. Same account video store as creator capture.
            Classification is later. Nothing is admitted from this dump.
          </p>
          {lastUrl ? (
            <a
              href={lastUrl}
              className='block truncate text-xs text-secondary-token underline'
              target='_blank'
              rel='noreferrer'
            >
              Last walk stored
            </a>
          ) : null}
        </div>
        {phase === 'recording' ? (
          <Button
            type='button'
            size='sm'
            variant='secondary'
            onClick={() => void stopRecording()}
          >
            <Square className='h-3.5 w-3.5' aria-hidden='true' />
            Stop
          </Button>
        ) : (
          <Button
            type='button'
            size='sm'
            onClick={primaryAction}
            disabled={phase === 'uploading' || !userId}
          >
            <Circle className='h-3.5 w-3.5 fill-current' aria-hidden='true' />
            {recordLabel}
          </Button>
        )}
      </div>
    </ContentSurfaceCard>
  );
}
