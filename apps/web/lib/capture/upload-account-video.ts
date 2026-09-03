'use client';

import { uploadPresigned } from '@vercel/blob/client';
import {
  buildFileBlobPath,
  resolveChatFileUploadMime,
} from '@/lib/media/file-policy';
import { ACCOUNT_VIDEO_UPLOAD_PATH } from './account-video';
import type { AccountVideoUpload } from './types';

/**
 * Uploads a recorded/selected video into the caller's own
 * `jovie/files/account_video/<ownerId>/` prefix. `ownerId` must be the
 * authenticated user's id — the token route refuses foreign prefixes.
 */
export async function uploadAccountVideo(
  file: File,
  ownerId: string
): Promise<AccountVideoUpload> {
  const blob = await uploadPresigned(
    buildFileBlobPath('account_video', ownerId, file.name),
    file,
    {
      access: 'public',
      handleUploadUrl: ACCOUNT_VIDEO_UPLOAD_PATH,
      contentType: resolveChatFileUploadMime(file) ?? file.type,
    }
  );
  return {
    url: blob.url,
    fileName: file.name,
    byteSize: file.size,
  };
}
