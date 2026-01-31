'use client';

import { useMemo } from 'react';
import type { HelperState } from './types';

interface UseHelperStateProps {
  readonly handle: string;
  readonly handleError: string | null;
  readonly checkingAvail: boolean;
  readonly available: boolean | null;
  readonly availError: string | null;
  readonly displayDomain: string;
}

export function useHelperState({
  handle,
  handleError,
  checkingAvail,
  available,
  availError,
  displayDomain,
}: UseHelperStateProps): HelperState {
  return useMemo(() => {
    if (!handle) {
      return {
        tone: 'idle' as const,
        text: `Your Jovie profile will live at ${displayDomain}/your-handle`,
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

    if (available === false) {
      return { tone: 'error' as const, text: 'Handle already taken' };
    }

    if (availError) {
      return { tone: 'error' as const, text: availError };
    }

    return {
      tone: 'idle' as const,
      text: 'Use lowercase letters, numbers, or hyphens (3–30 chars).',
    };
  }, [
    available,
    availError,
    checkingAvail,
    displayDomain,
    handle,
    handleError,
  ]);
}

export const HELPER_TONE_CLASSES = {
  idle: 'text-gray-600 dark:text-gray-300',
  pending: 'text-gray-600 dark:text-gray-300',
  success: 'text-emerald-600 dark:text-emerald-400',
  error: 'text-red-600 dark:text-red-400',
} as const;
