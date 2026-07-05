'use client';

import { FileAudio2, Loader2, X } from 'lucide-react';

import type { PendingAudio } from '../hooks/useChatAudioAttachments';

interface AudioPreviewStripProps {
  readonly audio: PendingAudio;
  readonly onRemove?: () => void;
}

function inferenceLabel(audio: PendingAudio): string {
  if (audio.status === 'uploading') {
    return 'Uploading audio…';
  }

  if (audio.status === 'error') {
    return audio.error ?? 'Upload failed';
  }

  if (audio.inference?.kind === 'attach-to-existing') {
    return `Matched ${audio.releaseTitle ?? 'release'} · attaching audio`;
  }

  if (audio.inference?.kind === 'reference') {
    return `Reference for ${audio.releaseTitle ?? 'release'}`;
  }

  return `New track · ${audio.releaseTitle ?? audio.name}`;
}

export function AudioPreviewStrip({ audio, onRemove }: AudioPreviewStripProps) {
  return (
    <div
      className='system-b-image-preview-strip'
      data-testid='chat-audio-preview-strip'
    >
      <div className='flex items-center justify-between gap-3'>
        <p className='system-b-image-preview-strip-title'>Audio</p>
        {onRemove ? (
          <button
            type='button'
            onClick={onRemove}
            className='system-b-image-preview-remove'
            aria-label={`Remove ${audio.name}`}
          >
            <X className='h-3.5 w-3.5' />
          </button>
        ) : null}
      </div>

      <div className='mt-2 flex items-center gap-3 rounded-xl border border-subtle bg-surface-1 px-3 py-2.5'>
        <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
          {audio.status === 'uploading' ? (
            <Loader2 className='h-4 w-4 animate-spin text-secondary-token' />
          ) : (
            <FileAudio2 className='h-4 w-4 text-secondary-token' />
          )}
        </div>
        <div className='min-w-0 flex-1'>
          <p className='truncate text-sm font-medium text-primary-token'>
            {audio.name}
          </p>
          <p className='truncate text-xs text-secondary-token'>
            {inferenceLabel(audio)}
          </p>
        </div>
        {audio.status === 'ready' && audio.previewUrl ? (
          <audio
            controls
            src={audio.previewUrl}
            className='h-8 max-w-[9rem]'
            data-testid='chat-audio-preview-player'
          >
            <track kind='captions' />
          </audio>
        ) : null}
      </div>
    </div>
  );
}
