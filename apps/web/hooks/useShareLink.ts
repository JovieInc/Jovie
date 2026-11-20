'use client';

/**
 * Native share sheet with a clipboard fallback.
 *
 * Uses navigator.share where it exists (phones). Where it does not, or where
 * it rejects for a reason other than the person cancelling, the link is copied
 * through useClipboard and `copied` flips true for the reset delay so the
 * caller can show a confirmation.
 */

import { useCallback } from 'react';
import { useClipboard } from '@/hooks/useClipboard';

export type ShareLinkMethod = 'native' | 'clipboard';
export type ShareLinkResult = ShareLinkMethod | 'cancelled' | 'failed';

export interface ShareLinkInput {
  readonly title: string;
  readonly url: string;
}

export interface UseShareLinkReturn {
  readonly share: (input: ShareLinkInput) => Promise<ShareLinkResult>;
  /** True briefly after the link was copied instead of shared natively. */
  readonly copied: boolean;
}

export function useShareLink(): UseShareLinkReturn {
  const { copy, isSuccess } = useClipboard();

  const share = useCallback(
    async ({ title, url }: ShareLinkInput): Promise<ShareLinkResult> => {
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title, url });
          return 'native';
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            return 'cancelled';
          }
        }
      }
      return (await copy(url)) ? 'clipboard' : 'failed';
    },
    [copy]
  );

  return { share, copied: isSuccess };
}
