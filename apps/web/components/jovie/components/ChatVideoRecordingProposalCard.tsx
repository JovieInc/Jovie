'use client';

import { Button } from '@jovie/ui';
import { Check, Loader2, Upload, Video } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TeleprompterShowcaseInterstitial } from '@/components/jovie/components/TeleprompterShowcaseInterstitial';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { trackTeleprompterFunnel } from '@/lib/teleprompter/analytics';
import { shouldShowTeleprompterShowcase } from '@/lib/teleprompter/persistence';
import { startTeleprompterRecording } from '@/lib/teleprompter/recorder';
import type { VideoRecordingProposalPayload } from '@/lib/teleprompter/types';
import {
  getTeleprompterVideoAcceptTypes,
  uploadRecordableVideo,
} from '@/lib/teleprompter/upload-video';
import { cn } from '@/lib/utils';

interface ChatVideoRecordingProposalCardProps {
  readonly profileId: string;
  readonly payload: VideoRecordingProposalPayload;
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export function ChatVideoRecordingProposalCard({
  profileId,
  payload,
}: ChatVideoRecordingProposalCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackedProposalRef = useRef(false);
  const [showcaseOpen, setShowcaseOpen] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (trackedProposalRef.current) return;
    trackedProposalRef.current = true;
    trackTeleprompterFunnel('teleprompter_proposal_impression', {
      profileId,
      kind: payload.kind,
      showcaseVariant: payload.showcaseVariant,
      title: payload.title,
    });
  }, [profileId, payload]);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const recordingContext = useMemo(
    () => ({
      profileId,
      kind: payload.kind,
      title: payload.title,
      script: payload.script,
      showcaseVariant: payload.showcaseVariant,
      source: 'chat_proposal' as const,
    }),
    [profileId, payload]
  );

  const openRecorder = useCallback(() => {
    startTeleprompterRecording(recordingContext);
  }, [recordingContext]);

  const openShowcaseOrRecorder = useCallback(() => {
    if (shouldShowTeleprompterShowcase(profileId, payload.showcaseVariant)) {
      setShowcaseOpen(true);
      return;
    }
    openRecorder();
  }, [profileId, payload.showcaseVariant, openRecorder]);

  const scheduleShowcaseOnHover = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      if (shouldShowTeleprompterShowcase(profileId, payload.showcaseVariant)) {
        setShowcaseOpen(true);
      }
    }, 280);
  };

  const cancelShowcaseOnHover = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  const handleUploadClick = () => {
    if (uploadState === 'uploading') return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploadState('uploading');
    setUploadError(null);
    try {
      await uploadRecordableVideo({
        file,
        profileId,
        kind: payload.kind,
        showcaseVariant: payload.showcaseVariant,
      });
      setUploadState('success');
    } catch (error) {
      setUploadState('error');
      setUploadError(
        error instanceof Error ? error.message : 'Upload failed. Try again.'
      );
    }
  };

  if (uploadState === 'success') {
    return (
      <ContentSurfaceCard
        className='system-b-chat-video-recording-state-card'
        data-testid='chat-video-recording-upload-success'
      >
        <div className='flex items-center gap-2 text-success'>
          <Check className='h-4 w-4' aria-hidden='true' />
          <span className='text-sm font-medium'>Video uploaded to Library</span>
        </div>
      </ContentSurfaceCard>
    );
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type='file'
        accept={getTeleprompterVideoAcceptTypes()}
        className='hidden'
        tabIndex={-1}
        onChange={handleFileChange}
      />
      <ContentSurfaceCard
        className='system-b-chat-video-recording-card p-4'
        data-testid='chat-video-recording-proposal-card'
      >
        <div className='flex flex-col gap-3'>
          <div>
            <p className='text-sm font-semibold text-primary-token'>
              {payload.title}
            </p>
            <p className='mt-1 line-clamp-3 text-xs leading-5 text-secondary-token'>
              {payload.script}
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={handleUploadClick}
              disabled={uploadState === 'uploading'}
              data-testid='chat-video-recording-upload'
            >
              {uploadState === 'uploading' ? (
                <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
              ) : (
                <Upload className='mr-1.5 h-3.5 w-3.5' aria-hidden='true' />
              )}
              Upload Video
            </Button>
            <Button
              type='button'
              size='sm'
              className={cn('bg-btn-primary text-btn-primary-foreground')}
              onClick={openShowcaseOrRecorder}
              onMouseEnter={scheduleShowcaseOnHover}
              onMouseLeave={cancelShowcaseOnHover}
              onFocus={scheduleShowcaseOnHover}
              onBlur={cancelShowcaseOnHover}
              data-testid='chat-video-recording-record-in-app'
            >
              <Video className='mr-1.5 h-3.5 w-3.5' aria-hidden='true' />
              Record In App
            </Button>
          </div>
          {uploadState === 'error' && uploadError ? (
            <p className='text-xs text-error' role='alert'>
              {uploadError}
            </p>
          ) : null}
        </div>
      </ContentSurfaceCard>

      <TeleprompterShowcaseInterstitial
        open={showcaseOpen}
        onOpenChange={setShowcaseOpen}
        profileId={profileId}
        kind={payload.kind}
        title={payload.title}
        script={payload.script}
        showcaseVariant={payload.showcaseVariant}
        onStartRecording={openRecorder}
      />
    </>
  );
}
