'use client';

import { useMutation } from '@tanstack/react-query';
import type { GeneratedPitches } from '@/lib/services/pitch';
import { FetchError } from './fetch';

/**
 * Mutation hook for generating playlist pitches for a release.
 */
export function useReleasePitchMutation() {
  return useMutation<GeneratedPitches, Error, string>({
    mutationFn: async (releaseId: string) => {
      const res = await fetch(`/api/dashboard/releases/${releaseId}/pitch`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new FetchError(
          body.error ?? `Failed to generate pitches (${res.status})`,
          res.status
        );
      }
      return res.json();
    },
  });
}
