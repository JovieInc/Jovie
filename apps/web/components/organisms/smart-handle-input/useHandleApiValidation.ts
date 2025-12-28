import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type ClientValidationResult,
  debounce,
} from '@/lib/validation/client-username';
import type { HandleValidationState } from './types';

interface UseHandleApiValidationProps {
  value: string;
  clientValidation: ClientValidationResult;
  usernameSuggestions: string[];
  showAvailability: boolean;
}

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
  const requestIdRef = useRef(0);

  const debouncedApiValidation = useMemo(
    () =>
      debounce(
        async (
          handleValue: string,
          requestId: number,
          abortController: AbortController
        ) => {
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

          const timeoutId = setTimeout(() => {
            abortController.abort();
          }, 5000);

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

            if (
              abortController.signal.aborted ||
              requestId !== requestIdRef.current
            )
              return;

            if (!response.ok) {
              throw new Error(
                `HTTP ${response.status}: ${response.statusText}`
              );
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
            if (requestId !== requestIdRef.current) return;

            if (error instanceof Error && error.name === 'AbortError') {
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
        500
      ),
    [clientValidation.valid]
  );

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
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      requestIdRef.current += 1;
      setHandleValidation(prev => ({
        ...prev,
        checking: false,
        available: false,
      }));
      return;
    }

    const nextRequestId = requestIdRef.current + 1;
    requestIdRef.current = nextRequestId;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setHandleValidation(prev => ({
      ...prev,
      checking: true,
      error: null,
    }));

    debouncedApiValidation(value, nextRequestId, abortController);
  }, [
    value,
    clientValidation,
    usernameSuggestions,
    debouncedApiValidation,
    showAvailability,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return handleValidation;
}
