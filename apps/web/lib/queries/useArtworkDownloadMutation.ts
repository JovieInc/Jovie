'use client';

import { useMutation } from '@tanstack/react-query';
import { fetchWithTimeoutResponse } from './fetch';
import { handleMutationError } from './mutation-utils';

interface ArtworkDownloadInput {
  url: string;
  title: string;
  sizeKey: string;
}

/**
 * Mutation for downloading album artwork as a blob and triggering a file download.
 */
export function useArtworkDownloadMutation() {
  return useMutation<void, Error, ArtworkDownloadInput>({
    mutationFn: async ({ url, title, sizeKey }) => {
      const response = await fetchWithTimeoutResponse(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;

      const filename = sanitizeFilename(title);
      const sizeLabel = sizeKey === 'original' ? '' : `-${sizeKey}`;
      const contentType = response.headers.get('content-type') ?? '';
      let ext = 'avif';
      if (contentType.includes('jpeg') || contentType.includes('jpg'))
        ext = 'jpg';
      else if (contentType.includes('png')) ext = 'png';
      else if (contentType.includes('webp')) ext = 'webp';
      link.download = `${filename}${sizeLabel}.${ext}`;

      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    },
    onError: (error: unknown) => {
      handleMutationError(error, 'Failed to download artwork');
    },
  });
}

function sanitizeFilename(title: string): string {
  const sanitized = title
    .replaceAll(/[^a-zA-Z0-9\s-]/g, '')
    .replaceAll(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 100);
  return sanitized || 'artwork';
}
