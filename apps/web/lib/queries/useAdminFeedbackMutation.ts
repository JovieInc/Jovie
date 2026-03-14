'use client';

import { useMutation } from '@tanstack/react-query';
import { fetchWithTimeout } from './fetch';
import { handleMutationError } from './mutation-utils';

interface DismissFeedbackResponse {
  success: boolean;
}

/**
 * TanStack Query mutation hook for dismissing admin feedback items.
 *
 * @example
 * const { mutateAsync: dismiss } = useDismissFeedbackMutation();
 * await dismiss('feedback-id');
 */
export function useDismissFeedbackMutation() {
  return useMutation({
    mutationFn: async (
      feedbackId: string
    ): Promise<DismissFeedbackResponse> => {
      return fetchWithTimeout<DismissFeedbackResponse>(
        `/api/admin/feedback/${feedbackId}/dismiss`,
        { method: 'POST' }
      );
    },
    onError: error => {
      handleMutationError(error, 'Failed to dismiss feedback');
    },
  });
}
