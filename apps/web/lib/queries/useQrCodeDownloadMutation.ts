'use client';

import { useMutation } from '@tanstack/react-query';
import { fetchWithTimeoutResponse } from './fetch';
import { handleMutationError, handleMutationSuccess } from './mutation-utils';

interface QrCodeDownloadInput {
  qrUrl: string;
  filename: string;
}

/**
 * Mutation for downloading a QR code image as a blob and triggering a file download.
 */
export function useQrCodeDownloadMutation() {
  return useMutation<void, Error, QrCodeDownloadInput>({
    mutationFn: async ({ qrUrl, filename }) => {
      const response = await fetchWithTimeoutResponse(qrUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      handleMutationSuccess('QR code downloaded');
    },
    onError: (error: unknown) => {
      handleMutationError(error, 'Failed to download QR code');
    },
  });
}
