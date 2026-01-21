'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { captureWarning } from '@/lib/error-tracking';
import {
  generateUsernameSuggestions,
  validateUsernameFormat,
} from '@/lib/validation/client-username';
import type { HandleValidationState } from './types';

interface UseHandleValidationOptions {
  normalizedInitialHandle: string;
  fullName: string;
}

interface UseHandleValidationReturn {
  handleValidation: HandleValidationState;
  setHandleValidation: React.Dispatch<
    React.SetStateAction<HandleValidationState>
  >;
  handle: string;
  setHandle: React.Dispatch<React.SetStateAction<string>>;
  validateHandle: (input: string) => Promise<void>;
}

/**
 * Hook to manage handle validation state and API checks.
 */
export function useHandleValidation({
  normalizedInitialHandle,
  fullName,
}: UseHandleValidationOptions): UseHandleValidationReturn {
  const [handle, setHandle] = useState(normalizedInitialHandle);
  const [handleValidation, setHandleValidation] =
    useState<HandleValidationState>({
      available: false,
      checking: false,
      error: null,
      clientValid: Boolean(normalizedInitialHandle),
      suggestions: [],
    });

  const validationSequence = useRef(0);
  const abortController = useRef<AbortController | null>(null);

  const validateHandle = useCallback(
    async (input: string) => {
      const normalizedInput = input.trim().toLowerCase();
      validationSequence.current += 1;
      const runId = validationSequence.current;

      if (
        normalizedInitialHandle &&
        normalizedInput === normalizedInitialHandle
      ) {
        setHandle(normalizedInput);
        setHandleValidation({
          available: true,
          checking: false,
          error: null,
          clientValid: true,
          suggestions: [],
        });
        return;
      }

      const clientResult = validateUsernameFormat(normalizedInput);
      if (!clientResult.valid) {
        setHandleValidation({
          available: false,
          checking: false,
          error: clientResult.error,
          clientValid: false,
          suggestions: clientResult.suggestion ? [clientResult.suggestion] : [],
        });
        return;
      }

      abortController.current?.abort();
      const controller = new AbortController();
      abortController.current = controller;

      setHandleValidation({
        available: false,
        checking: true,
        error: null,
        clientValid: true,
        suggestions: [],
      });

      try {
        const response = await fetch(
          `/api/handle/check?handle=${encodeURIComponent(normalizedInput)}`,
          { signal: controller.signal }
        );

        if (validationSequence.current !== runId) return;

        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error || 'Unable to check handle.');
        }

        const data = (await response.json()) as {
          available: boolean;
          error?: string;
        };

        if (validationSequence.current !== runId) return;

        if (data.available) {
          setHandle(normalizedInput);
          setHandleValidation({
            available: true,
            checking: false,
            error: null,
            clientValid: true,
            suggestions: [],
          });
        } else {
          const suggestions = generateUsernameSuggestions(
            normalizedInput,
            fullName
          ).slice(0, 3);
          setHandleValidation({
            available: false,
            checking: false,
            error: data.error || 'Handle already taken',
            clientValid: true,
            suggestions,
          });
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        // Capture warning to Sentry for monitoring API failures
        void captureWarning('Handle validation API failed', error, {
          handle: normalizedInput,
          route: '/onboarding',
          component: 'useHandleValidation',
        });

        setHandleValidation({
          available: false,
          checking: false,
          error: 'Unable to check handle right now.',
          clientValid: true,
          suggestions: [],
        });
      }
    },
    [fullName, normalizedInitialHandle]
  );

  useEffect(() => {
    return () => {
      abortController.current?.abort();
    };
  }, []);

  return {
    handleValidation,
    setHandleValidation,
    handle,
    setHandle,
    validateHandle,
  };
}
