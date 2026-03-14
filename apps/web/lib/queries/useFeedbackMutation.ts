'use client';

import { useMutation } from '@tanstack/react-query';
import { fetchWithTimeout } from './fetch';

interface FeedbackInput {
  message: string;
  source: string;
  pathname: string | null;
}

interface FeedbackResponse {
  success?: boolean;
  error?: string;
}

/**
 * Mutation for submitting user feedback.
 */
export function useFeedbackMutation() {
  return useMutation<FeedbackResponse, Error, FeedbackInput>({
    mutationFn: async input => {
      return fetchWithTimeout<FeedbackResponse>('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    },
  });
}
