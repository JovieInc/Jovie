'use client';

import { useMemo } from 'react';
import type { HelperState } from './types';

interface UseHelperStateProps {
  readonly handle: string;
  readonly handleError: string | null;
  readonly checkingAvail: boolean;
  readonly available: boolean | null;
  readonly availError: string | null;
  readonly displayDomain?: string;
}

export function useHelperState({
  handle,
  handleError,
  checkingAvail,
  available,
  availError,
}: UseHelperStateProps): HelperState {
  return useMemo(() => {
    if (!handle) {
      return {
        tone: 'idle' as const,
        text: '',
      };
    }

    if (handleError) {
      return { tone: 'error' as const, text: handleError };
    }

    if (checkingAvail) {
      return { tone: 'pending' as const, text: 'Checking availability…' };
    }

    if (available === true) {
      return {
        tone: 'success' as const,
        text: `@${handle} is available — tap the button to claim it.`,
      };
    }

    // Show availError before "already taken" so timeout/network errors
    // display their specific message instead of a misleading "taken" label.
    if (availError) {
      return { tone: 'error' as const, text: availError };
    }

    if (available === false) {
      return { tone: 'error' as const, text: 'Handle already taken' };
    }

    return {
      tone: 'idle' as const,
      text: 'Use lowercase letters, numbers, or hyphens (3–30 chars).',
    };
  }, [available, availError, checkingAvail, handle, handleError]);
}

export const HELPER_TONE_CLASSES = {
  idle: 'text-secondary-token',
  pending: 'text-secondary-token',
  success: 'text-success',
  error: 'text-destructive',
} as const;
