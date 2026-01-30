'use client';

import { useMutation } from '@tanstack/react-query';
import { FetchError, fetchWithTimeout } from './fetch';

export interface LinkVerificationInput {
  shortId: string;
  verified: boolean;
  timestamp: number;
}

export interface LinkVerificationResponse {
  url: string;
}

/**
 * Verify a sensitive link and get the redirect URL.
 */
async function verifyLink(
  input: LinkVerificationInput
): Promise<LinkVerificationResponse> {
  try {
    const data = await fetchWithTimeout<LinkVerificationResponse>(
      `/api/link/${input.shortId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          verified: input.verified,
          timestamp: input.timestamp,
        }),
      }
    );

    if (!data.url) {
      throw new FetchError('Invalid response from server.', 500);
    }

    return data;
  } catch (error) {
    if (error instanceof FetchError) {
      // Provide user-friendly messages for specific status codes
      if (error.status === 429) {
        throw new FetchError(
          'Too many requests. Please wait a moment.',
          429,
          error.response
        );
      }
      if (error.status === 404) {
        throw new FetchError('Link not found or expired.', 404, error.response);
      }
    }
    throw error;
  }
}

export interface UseLinkVerificationMutationOptions {
  onSuccess?: (data: LinkVerificationResponse) => void;
  onError?: (error: Error) => void;
}

/**
 * TanStack Query mutation hook for verifying sensitive links.
 *
 * Used on the interstitial page to verify human interaction
 * before redirecting to potentially sensitive external URLs.
 *
 * @example
 * const { mutate: verifyLink, isPending, error } = useLinkVerificationMutation({
 *   onSuccess: (data) => {
 *     window.location.replace(data.url);
 *   },
 * });
 *
 * verifyLink({ shortId: 'abc123', verified: true, timestamp: Date.now() });
 */
export function useLinkVerificationMutation(
  options: UseLinkVerificationMutationOptions = {}
) {
  const { onSuccess, onError } = options;

  return useMutation({
    mutationFn: verifyLink,
    onSuccess: data => {
      onSuccess?.(data);
    },
    onError: error => {
      onError?.(
        error instanceof Error ? error : new Error('Verification failed')
      );
    },
    retry: false, // Don't retry verification
  });
}
