'use client';

import { Button } from '@jovie/ui';
import { VideoOff } from 'lucide-react';
import {
  cameraErrorCopy,
  type StudioCameraError,
} from '@/lib/teleprompter/studio-recorder';

interface StudioCameraBlockedProps {
  readonly error: StudioCameraError;
  readonly onRetry: () => void;
  readonly onClose: () => void;
}

export function StudioCameraBlocked({
  error,
  onRetry,
  onClose,
}: StudioCameraBlockedProps) {
  const copy = cameraErrorCopy(error);
  return (
    <section
      role='alert'
      className='flex flex-col items-start gap-4 pt-12'
      data-testid='teleprompter-studio-camera-blocked'
    >
      <VideoOff className='size-6 text-on-media/60' aria-hidden='true' />
      <h2 className='text-2xl xl:text-3xl leading-tight tracking-tight font-semibold text-balance'>
        {copy.title}
      </h2>
      <p className='max-w-md text-sm text-on-media/70'>{copy.body}</p>
      <div className='flex gap-2'>
        {error === 'no-device' || error === 'unsupported' ? null : (
          <Button variant='primary' onClick={onRetry}>
            Try Again
          </Button>
        )}
        <Button variant='secondary' onClick={onClose}>
          Back To Chat
        </Button>
      </div>
    </section>
  );
}
