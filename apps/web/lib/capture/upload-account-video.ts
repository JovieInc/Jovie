'use client';

import { upload } from '@vercel/blob/client';
import { ACCOUNT_VIDEO_UPLOAD_PATH } from './account-video';
import type { AccountVideoUpload } from './types';

export async function uploadAccountVideo(
  file: File
): Promise<AccountVideoUpload> {
  const blob = await upload(file.name, file, {
    access: 'public',
    handleUploadUrl: ACCOUNT_VIDEO_UPLOAD_PATH,
  });
  return {
    url: blob.url,
    fileName: file.name,
    byteSize: file.size,
  };
}
