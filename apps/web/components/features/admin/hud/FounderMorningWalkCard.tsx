'use client';

import { Button } from '@jovie/ui';
import { Circle, Square } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from '@/components/feedback';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  canRecordScreen,
  type ScreenRecordingSession,
  startScreenRecording,
} from '@/lib/capture/record-screen';
import { uploadAccountVideo } from '@/lib/capture/upload-account-video';
import { FOUNDER_WALK_CONFIRM_PATH } from '@/lib/hud/founder-walk';

type WalkPhase = 'idle' | 'recording' | 'uploading';

export function FounderMorningWalkCard(props: {
  readonly mrrLabel: string;
  readonly cashLabel: string;
  readonly defaultStatus: string;
}) {
  const [phase, setPhase] = useState<WalkPhase>('idle');
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const sessionRef = useRef<ScreenRecordingSession | null>(null);

  const finishUpload = useCallback(async (session: ScreenRecordingSession) => {
    setPhase('uploading');
    try {
      const recording = await session.stop();
      const uploaded = await uploadAccountVideo(recording.file);
      const confirm = await fetch(FOUNDER_WALK_CONFIRM_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blobUrl: uploaded.url,
          durationMs: recording.durationMs,
          byteSize: recording.byteSize,
        }),
      });
      if (!confirm.ok) {
        throw new Error('Walk confirm failed');
      }
      setLastUrl(uploaded.url);
      toast.success('Walk stored. Nothing admitted until it is classified.');
    } catch {
      toast.error('Could not store the walk. Try again.');
    } finally {
      sessionRef.current = null;
      setPhase('idle');
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (!canRecordScreen()) {
      toast.error('Screen recording is not available in this window.');
      return;
    }
    try {
      const session = await startScreenRecording('founder_walk');
      sessionRef.current = session;
      setPhase('recording');
    } catch {
      toast.error('Screen recording was blocked or cancelled.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    void finishUpload(session);
  }, [finishUpload]);

  return (
    <ContentSurfaceCard className='p-3' data-testid='founder-morning-walk'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0 space-y-1'>
          <p className='text-2xs font-medium uppercase tracking-[0.08em] text-tertiary-token'>
            Morning walk
          </p>
          <p className='text-sm text-primary-token'>
            MRR {props.mrrLabel} · Cash {props.cashLabel} ·{' '}
            {props.defaultStatus}
          </p>
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
            onClick={stopRecording}
          >
            <Square className='h-3.5 w-3.5' aria-hidden='true' />
            Stop
          </Button>
        ) : (
          <Button
            type='button'
            size='sm'
            onClick={() => void startRecording()}
            disabled={phase === 'uploading'}
          >
            <Circle className='h-3.5 w-3.5 fill-current' aria-hidden='true' />
            {phase === 'uploading' ? 'Storing…' : 'Record walk'}
          </Button>
        )}
      </div>
    </ContentSurfaceCard>
  );
}
