'use client';

import { upload } from '@vercel/blob/client';
import { trackTeleprompterFunnel } from './analytics';
import type { RecordableVideoKind, TeleprompterShowcaseVariant } from './types';

const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm,video/x-msvideo';

export function getTeleprompterVideoAcceptTypes(): string {
  return VIDEO_ACCEPT;
}

export async function uploadRecordableVideo(params: {
  readonly file: File;
  readonly profileId: string;
  readonly kind: RecordableVideoKind;
  readonly showcaseVariant: TeleprompterShowcaseVariant;
}): Promise<{ readonly blobUrl: string }> {
  const blob = await upload(params.file.name, params.file, {
    access: 'public',
    handleUploadUrl: '/api/chat/files/upload-token',
  });

  trackTeleprompterFunnel('teleprompter_video_uploaded', {
    profileId: params.profileId,
    kind: params.kind,
    showcaseVariant: params.showcaseVariant,
    fileName: params.file.name,
    fileSizeBytes: params.file.size,
    blobUrl: blob.url,
  });

  return { blobUrl: blob.url };
}
