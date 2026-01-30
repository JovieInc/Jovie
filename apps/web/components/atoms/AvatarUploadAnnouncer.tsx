'use client';

import type { AvatarUploadStatus } from '@/components/molecules/AvatarProgressRing';

export interface AvatarUploadAnnouncerProps {
  readonly progress: number;
  readonly status: AvatarUploadStatus;
}

export function AvatarUploadAnnouncer({
  progress,
  status,
}: AvatarUploadAnnouncerProps) {
  return (
    <>
      {progress > 0 && (
        <div className='sr-only' aria-live='polite' aria-atomic='true'>
          Uploading profile photo: {Math.round(progress)}% complete
        </div>
      )}

      {status === 'success' && (
        <div className='sr-only' aria-live='polite'>
          Profile photo uploaded successfully
        </div>
      )}

      {status === 'error' && (
        <div className='sr-only' aria-live='assertive'>
          Profile photo upload failed
        </div>
      )}
    </>
  );
}
