'use client';

import { revertReleaseArtwork } from '@/app/app/(shell)/dashboard/releases/actions';
import type { ReleaseViewModel } from '@/lib/discography/types';

export async function uploadReleaseArtwork(
  file: File,
  release: ReleaseViewModel
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(
    `/api/images/artwork/upload?releaseId=${encodeURIComponent(release.id)}`,
    { method: 'POST', body: formData }
  );

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Upload failed' }));
    throw new Error(error.message ?? 'Failed to upload artwork');
  }

  const result = await response.json();
  return result.artworkUrl;
}

export async function restoreReleaseArtwork(
  releaseId: string
): Promise<string> {
  const result = await revertReleaseArtwork(releaseId);
  return result.artworkUrl;
}
