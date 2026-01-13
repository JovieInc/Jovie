/**
 * Handle API Validation Hook
 *
 * Provides debounced handle availability checking using TanStack Pacer
 * for world-class debouncing with proper async handling and caching.
 *
 * @see https://tanstack.com/pacer
 */

import type { AsyncDebouncerState } from '@tanstack/react-pacer';
import { useAsyncDebouncer } from '@tanstack/react-pacer';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientValidationResult } from '@/lib/validation/client-username';
import type { HandleValidationState } from './types';

interface UseHandleApiValidationProps {
  value: string;
  clientValidation: ClientValidationResult;
  usernameSuggestions: string[];
  showAvailability: boolean;
}

const VALIDATION_DEBOUNCE_MS = 500;
const VALIDATION_TIMEOUT_MS = 5000;

export function useHandleApiValidation({
  value,
  clientValidation,
  usernameSuggestions,
  showAvailability,
}: UseHandleApiValidationProps) {
  const [handleValidation, setHandleValidation] =
    useState<HandleValidationState>({
      available: false,
      checking: false,
      error: null,
      clientValid: false,
      suggestions: [],
    });

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastValidatedRef = useRef<{
    handle: string;
    available: boolean;
  } | null>(null);

  // TanStack Pacer async debouncer for handle validation
  const asyncDebouncer = useAsyncDebouncer(
    async (handleValue: string) => {
      if (!clientValidation.valid) return;

      // Check cache first
      if (lastValidatedRef.current?.handle === handleValue) {
        const { available } = lastValidatedRef.current;

        setHandleValidation(prev => ({
          ...prev,
          available,
          checking: false,
          error: available ? null : 'Handle already taken',
        }));

        return;
      }

      // Cancel any in-flight request
      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Set up timeout
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, VALIDATION_TIMEOUT_MS);

      try {
        const response = await fetch(
          `/api/handle/check?handle=${encodeURIComponent(handleValue.toLowerCase())}`,
          {
            signal: abortController.signal,
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
          }
        );

        if (abortController.signal.aborted) return;

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        const available = !!result.available;

        setHandleValidation(prev => ({
          ...prev,
          available,
          checking: false,
          error: available ? null : result.error || 'Handle already taken',
        }));

        lastValidatedRef.current = { handle: handleValue, available };
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          // Check if it was a timeout
          if (abortController.signal.aborted) {
            setHandleValidation(prev => ({
              ...prev,
              available: false,
              checking: false,
              error: 'Check timed out - please try again',
            }));
          }
          return;
        }

        console.error('Handle validation error:', error);

        let errorMessage = 'Network error';
        if (error instanceof TypeError && error.message.includes('fetch')) {
          errorMessage = 'Connection failed - check your internet';
        } else if (error instanceof Error) {
          errorMessage = error.message.includes('HTTP')
            ? 'Server error - please try again'
            : 'Network error';
        }

        setHandleValidation(prev => ({
          ...prev,
          available: false,
          checking: false,
          error: errorMessage,
        }));

        lastValidatedRef.current = {
          handle: handleValue,
          available: false,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
    {
      wait: VALIDATION_DEBOUNCE_MS,
      onError: err => {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        console.error('Handle validation error:', err);
        setHandleValidation(prev => ({
          ...prev,
          available: false,
          checking: false,
          error: 'Validation failed',
        }));
      },
    },
    (state: AsyncDebouncerState<(handleValue: string) => Promise<void>>) => ({
      isPending: state.isPending,
      isExecuting: state.isExecuting,
    })
  );

  // Cancel function
  const cancelValidation = useCallback(() => {
    asyncDebouncer.cancel();
    abortControllerRef.current?.abort();
  }, [asyncDebouncer]);

  // Update validation state when handle or client validation changes
  useEffect(() => {
    setHandleValidation(prevValidation => ({
      ...prevValidation,
      clientValid: clientValidation.valid,
      error: clientValidation.error,
      suggestions: usernameSuggestions,
      available: clientValidation.valid ? prevValidation.available : false,
      checking: clientValidation.valid ? prevValidation.checking : false,
    }));

    if (!clientValidation.valid || value.length < 3 || !showAvailability) {
      cancelValidation();
      setHandleValidation(prev => ({
        ...prev,
        checking: false,
        available: false,
      }));
      return;
    }

    // Cancel any previous validation
    abortControllerRef.current?.abort();

    setHandleValidation(prev => ({
      ...prev,
      checking: true,
      error: null,
    }));

    void asyncDebouncer.maybeExecute(value);
  }, [
    value,
    clientValidation,
    usernameSuggestions,
    asyncDebouncer,
    showAvailability,
    cancelValidation,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return handleValidation;
}
