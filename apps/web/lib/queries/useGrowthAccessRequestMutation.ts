'use client';

/**
 * Mutation hook for requesting early access to the Growth plan.
 */

import { useMutation } from '@tanstack/react-query';
import { fetchWithTimeout } from './fetch';
import { handleMutationError } from './mutation-utils';

export interface GrowthAccessRequestInput {
  reason: string;
}

export interface GrowthAccessRequestResponse {
  success: boolean;
}

async function submitGrowthAccessRequest(
  input: GrowthAccessRequestInput
): Promise<GrowthAccessRequestResponse> {
  return fetchWithTimeout<GrowthAccessRequestResponse>(
    '/api/growth-access-request',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: input.reason }),
    }
  );
}

/**
 * Hook for submitting a Growth plan early access request.
 *
 * @example
 * ```tsx
 * const { mutate, isPending } = useGrowthAccessRequestMutation();
 * mutate({ reason: 'I want A/B testing for my releases' }, {
 *   onSuccess: () => { ... },
 * });
 * ```
 */
export function useGrowthAccessRequestMutation() {
  return useMutation({
    mutationFn: submitGrowthAccessRequest,
    onError: error => {
      handleMutationError(error, 'Failed to submit request');
    },
  });
}
