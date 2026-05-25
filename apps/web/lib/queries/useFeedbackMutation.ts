'use client';

import { useMutation } from '@tanstack/react-query';
import { fetchWithTimeout } from './fetch';

interface FeedbackInput {
  message: string;
  source: string;
  pathname: string | null;
}

interface FeedbackResponse {
  ok?: boolean;
  id?: string;
  error?: string;
}

/**
 * Mutation for submitting user feedback.
 */
export function useFeedbackMutation() {
  return useMutation<FeedbackResponse, Error, FeedbackInput>({
    mutationFn: async input => {
      const response = await fetchWithTimeout<FeedbackResponse>(
        '/api/feedback',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }
      );
      if (response.ok !== true) {
        throw new Error(response.error ?? 'Unable to submit feedback');
      }
      return response;
    },
  });
}
