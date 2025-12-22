'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Input } from '@/components/atoms/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  type ClientValidationResult,
  debounce,
  generateUsernameSuggestions,
  validateUsernameFormat,
} from '@/lib/validation/client-username';

interface SmartHandleInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (validation: HandleValidationState) => void;
  placeholder?: string;
  prefix?: string;
  showAvailability?: boolean;
  formatHints?: boolean;
  disabled?: boolean;
  artistName?: string;
  className?: string;
}

export interface HandleValidationState {
  available: boolean;
  checking: boolean;
  error: string | null;
  clientValid: boolean;
  suggestions: string[];
}

export function SmartHandleInput({
  value,
  onChange,
  onValidationChange,
  placeholder = 'yourname',
  prefix = 'jovie.link/',
  showAvailability = true,
  formatHints = true,
  disabled = false,
  artistName,
  className = '',
}: SmartHandleInputProps) {
  const inputId = useId();
  const statusId = useId();
  const previewId = useId();

  // Handle validation state
  const [handleValidation, setHandleValidation] =
    useState<HandleValidationState>({
      available: false,
      checking: false,
      error: null,
      clientValid: false,
      suggestions: [],
    });

  // Abort controller for canceling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastValidatedRef = useRef<{
    handle: string;
    available: boolean;
  } | null>(null);

  // Instant client-side validation (optimized for <50ms response time)
  const validateClientSide = useCallback(
    (handleValue: string): ClientValidationResult =>
      validateUsernameFormat(handleValue),
    []
  );

  // Memoized client validation result
  const clientValidation = useMemo(
    () => validateClientSide(value),
    [value, validateClientSide]
  );

  // Memoized username suggestions
  const usernameSuggestions = useMemo(() => {
    if (clientValidation.valid || !value) return [];
    return generateUsernameSuggestions(value, artistName);
  }, [value, artistName, clientValidation.valid]);

  // Debounced API validation with reduced delay for better UX
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
          }, 5000); // 5 second timeout

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

  useEffect(() => {
    onValidationChange?.(handleValidation);
  }, [handleValidation, onValidationChange]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const ValidationStatusIcon = () => {
    if (!showAvailability) return null;
    if (handleValidation.checking) {
      return <LoadingSpinner size='sm' tone='muted' />;
    }
    if (handleValidation.available && clientValidation.valid) {
      return (
        <span
          aria-hidden
          className='flex size-4 items-center justify-center rounded-full bg-surface-2 text-(--accent-speed)'
        >
          <Icon name='Check' className='size-3' strokeWidth={2.5} />
        </span>
      );
    }
    if (handleValidation.error || !clientValidation.valid) {
      return (
        <span
          aria-hidden
          className='flex size-4 items-center justify-center rounded-full bg-surface-2 text-destructive'
        >
          <Icon name='X' className='size-3' strokeWidth={2.5} />
        </span>
      );
    }
    return null;
  };

  const getStatusMessage = () => {
    if (handleValidation.checking) {
      return 'Checking availability...';
    }
    if (handleValidation.available && clientValidation.valid) {
      return `@${value} is available!`;
    }
    if (handleValidation.error) {
      return handleValidation.error;
    }
    if (clientValidation.error) {
      return clientValidation.error;
    }
    return null;
  };

  const statusMessage = getStatusMessage();

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Input with prefix and validation icon */}
      <div className='relative'>
        <div className='absolute left-3 top-1/2 -translate-y-1/2 z-10 text-sm font-sans text-secondary-token'>
          {prefix}
        </div>
        <Input
          type='text'
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className='font-sans pl-20'
          inputClassName='font-sans'
          id={inputId}
          validationState={
            !value
              ? null
              : handleValidation.error || clientValidation.error
                ? 'invalid'
                : handleValidation.available && clientValidation.valid
                  ? 'valid'
                  : handleValidation.checking
                    ? 'pending'
                    : null
          }
          statusIcon={<ValidationStatusIcon />}
          aria-describedby={`${statusId} ${previewId}`}
          aria-label='Enter your desired handle'
          autoCapitalize='none'
          autoCorrect='off'
          autoComplete='off'
          inputMode='text'
        />
      </div>

      {/* Live preview */}
      <div className='text-xs text-secondary-token' id={previewId}>
        Your profile will be live at{' '}
        <span className='font-sans text-primary-token'>
          {prefix}
          {value || placeholder}
        </span>
      </div>

      {/* Status message - always reserve space to prevent layout shift */}
      <div
        className={`text-xs min-h-5 transition-all duration-300 ${
          statusMessage
            ? handleValidation.available && clientValidation.valid
              ? 'text-(--accent-speed) opacity-100'
              : 'text-destructive opacity-100'
            : 'opacity-0'
        }`}
        id={statusId}
        role='status'
        aria-live='polite'
      >
        {statusMessage || '\u00A0'}{' '}
        {/* Non-breaking space to maintain height */}
      </div>

      {/* Username suggestions */}
      {formatHints && handleValidation.suggestions.length > 0 && (
        <div className='space-y-2'>
          <p className='text-xs text-secondary-token'>Try these instead:</p>
          <div className='flex flex-wrap gap-2'>
            {handleValidation.suggestions.slice(0, 3).map(suggestion => (
              <button
                key={suggestion}
                type='button'
                onClick={() => onChange(suggestion)}
                className='text-xs px-3 py-1.5 rounded-md transition-colors duration-150 font-sans bg-surface-2 hover:bg-surface-3 text-primary-token'
                disabled={disabled}
              >
                @{suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Format hints */}
      {formatHints && !value && (
        <div className='text-xs text-secondary-token space-y-1'>
          <p>Great handles are:</p>
          <ul className='list-disc list-inside space-y-0.5 ml-2'>
            <li>Short and memorable (3-15 characters)</li>
            <li>Easy to type and share</li>
            <li>Consistent with your brand</li>
          </ul>
        </div>
      )}
    </div>
  );
}
