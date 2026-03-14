'use client';

import { useMutation } from '@tanstack/react-query';
import { fetchWithTimeout } from './fetch';

interface ApplePreSaveInput {
  releaseId: string;
  trackId: string | null;
  appleMusicUserToken: string;
}

interface ApplePreSaveResponse {
  success?: boolean;
  error?: string;
}

/**
 * Mutation for Apple Music pre-add/pre-save actions.
 */
export function useApplePreSaveMutation() {
  return useMutation<ApplePreSaveResponse, Error, ApplePreSaveInput>({
    mutationFn: async input => {
      return fetchWithTimeout<ApplePreSaveResponse>('/api/pre-save/apple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    },
  });
}
