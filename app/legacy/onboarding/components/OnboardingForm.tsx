'use client';

import { useUser } from '@clerk/nextjs';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { completeOnboarding } from '@/app/onboarding/actions';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { OptimisticProgress } from '@/components/ui/OptimisticProgress';
import { APP_URL } from '@/constants/app';
import {
  type ClientValidationResult,
  debounce,
  generateUsernameSuggestions,
  validateUsernameFormat,
} from '@/lib/validation/client-username';

interface OnboardingState {
  step:
    | 'validating'
    | 'creating-user'
    | 'checking-handle'
    | 'creating-artist'
    | 'complete';
  progress: number;
  error: string | null;
  retryCount: number;
  isSubmitting: boolean; // Prevent double submissions
}

interface HandleValidation {
  available: boolean;
  checking: boolean;
  error: string | null;
  clientValid: boolean;
  suggestions: string[];
}

interface SelectedArtist {
  spotifyId: string;
  artistName: string;
  imageUrl?: string;
  timestamp: number;
}

export function OnboardingForm() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Extract domain from APP_URL for display
  const displayDomain = APP_URL.replace(/^https?:\/\//, '');

  // Form state
  const [handle, setHandle] = useState('');
  const [selectedArtist, setSelectedArtist] = useState<SelectedArtist | null>(
    null
  );

  // Process state
  const [state, setState] = useState<OnboardingState>({
    step: 'validating',
    progress: 0,
    error: null,
    retryCount: 0,
    isSubmitting: false,
  });

  // Handle validation state
  const [handleValidation, setHandleValidation] = useState<HandleValidation>({
    available: false,
    checking: false,
    error: null,
    clientValid: false,
    suggestions: [],
  });

  // Prefill handle and selected artist data
  useEffect(() => {
    // Prefill handle from URL
    const urlHandle = searchParams?.get('handle');
    if (urlHandle) {
      setHandle(urlHandle);
    } else {
      try {
        const pending = sessionStorage.getItem('pendingClaim');
        if (pending) {
          const parsed = JSON.parse(pending) as { handle?: string };
          if (parsed.handle) setHandle(parsed.handle);
        }
      } catch {}
    }

    const stored = sessionStorage.getItem('selectedArtist');
    if (stored) {
      try {
        const artist = JSON.parse(stored) as SelectedArtist;
        setSelectedArtist(artist);
      } catch (error) {
        console.error('Error parsing selected artist:', error);
      }
    }
  }, [searchParams]);

  // Abort controller for canceling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastValidatedRef = useRef<{
    handle: string;
    available: boolean;
  } | null>(null);

  // Instant client-side validation (optimized for <50ms response time)
  const validateClientSide = useCallback(
    (handleValue: string): ClientValidationResult => {
      return validateUsernameFormat(handleValue);
    },
    []
  );

  // Memoized client validation result
  const clientValidation = useMemo(
    () => validateClientSide(handle),
    [handle, validateClientSide]
  );

  // Memoized username suggestions
  const usernameSuggestions = useMemo(() => {
    if (clientValidation.valid || !handle) return [];
    return generateUsernameSuggestions(handle, selectedArtist?.artistName);
  }, [handle, selectedArtist?.artistName, clientValidation.valid]);

  // Debounced API validation (only for format-valid handles)
  const debouncedApiValidation = useMemo(
    () =>
      debounce(async (handleValue: string) => {
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

        // Cancel previous request
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

        try {
          const response = await fetch(
            `/api/handle/check?handle=${encodeURIComponent(handleValue.toLowerCase())}`,
            { signal: abortController.signal }
          );

          if (abortController.signal.aborted) return;

          const result = await response.json();
          const available = !!result.available && response.ok;

          setHandleValidation(prev => ({
            ...prev,
            available,
            checking: false,
            error: response.ok
              ? available
                ? null
                : 'Handle already taken'
              : result.error || 'Error checking availability',
          }));

          lastValidatedRef.current = { handle: handleValue, available };
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return;

          console.error('Handle validation error:', error);
          setHandleValidation(prev => ({
            ...prev,
            available: false,
            checking: false,
            error: 'Network error',
          }));
          lastValidatedRef.current = { handle: handleValue, available: false };
        }
      }, 1000), // Increased debounce to 1000ms (less frequent API calls)
    [clientValidation.valid]
  );

  // Update validation state when handle or client validation changes
  useEffect(() => {
    // Update client validation state immediately
    setHandleValidation(prev => ({
      ...prev,
      clientValid: clientValidation.valid,
      error: clientValidation.error,
      suggestions: usernameSuggestions,
      available: clientValidation.valid ? prev.available : false,
    }));

    // Only trigger API validation for format-valid handles
    if (clientValidation.valid && handle.length >= 3) {
      debouncedApiValidation(handle);
    }
  }, [handle, clientValidation, usernameSuggestions, debouncedApiValidation]);

  // Prefetch dashboard route when handle is valid
  useEffect(() => {
    if (handleValidation.available && !handleValidation.checking) {
      // Prefetch dashboard assets for faster navigation after onboarding
      router.prefetch('/dashboard');
    }
  }, [handleValidation.available, handleValidation.checking, router]);

  // Memoized validation state for performance
  const validationState = useMemo(
    () => ({
      error: handleValidation.error,
      isClientValid: handleValidation.clientValid,
      isAvailable: handleValidation.available,
      isChecking: handleValidation.checking,
      canSubmit:
        handleValidation.clientValid &&
        handleValidation.available &&
        !handleValidation.checking,
    }),
    [handleValidation]
  );

  // Memoized progress steps for optimistic UI
  const progressSteps = useMemo(
    () => [
      { key: 'validating', label: 'Validating credentials', duration: 300 },
      { key: 'creating-user', label: 'Setting up account', duration: 400 },
      { key: 'checking-handle', label: 'Securing handle', duration: 300 },
      { key: 'creating-artist', label: 'Creating profile', duration: 500 },
    ],
    []
  );

  // Retry mechanism
  const retryOperation = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null,
      retryCount: prev.retryCount + 1,
    }));
  }, []);

  // Optimized submission handler with memoized dependencies
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user || state.isSubmitting || !validationState.canSubmit) return;

      setState(prev => ({
        ...prev,
        error: null,
        step: 'validating',
        progress: 0,
        isSubmitting: true,
      }));

      try {
        // Use the server action which handles authentication properly
        await completeOnboarding({
          username: handle.toLowerCase(),
          displayName: selectedArtist?.artistName || handle,
        });

        // Success! Server action will handle redirect
        setState(prev => ({ ...prev, step: 'complete', progress: 100 }));

        // Clear session data
        sessionStorage.removeItem('selectedArtist');
        sessionStorage.removeItem('pendingClaim');

        // Server action redirects to dashboard - no client redirect needed
      } catch (error) {
        console.error('Onboarding error:', error);

        // Check if this is a Next.js redirect (which is expected)
        if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
          // This is expected behavior - the redirect is working
          setState(prev => ({ ...prev, step: 'complete', progress: 100 }));
          return;
        }

        setState(prev => ({
          ...prev,
          error:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
          step: 'validating',
          progress: 0,
          isSubmitting: false,
        }));
      }
    },
    [
      user,
      handle,
      selectedArtist,
      state.isSubmitting,
      validationState.canSubmit,
    ]
  );

  // Progress indicator - currently unused
  // const getProgressText = () => {
  //   switch (state.step) {
  //     case 'validating':
  //       return 'Validating...';
  //     case 'creating-user':
  //       return 'Setting up your account...';
  //     case 'checking-handle':
  //       return 'Securing your handle...';
  //     case 'creating-artist':
  //       return 'Creating your profile...';
  //     case 'complete':
  //       return 'Profile created successfully!';
  //     default:
  //       return 'Processing...';
  //   }
  // };

  return (
    <div className='space-y-4'>
      {/* Optimistic Progress indicator */}
      <OptimisticProgress
        isActive={state.isSubmitting}
        steps={progressSteps}
        onComplete={() => {
          // Progress complete, waiting for server redirect
        }}
      />

      {/* Selected artist info */}
      {selectedArtist && (
        <div className='bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3'>
          <div className='flex items-center space-x-3'>
            {selectedArtist.imageUrl && (
              <div className='w-10 h-10 rounded-full overflow-hidden'>
                <Image
                  src={selectedArtist.imageUrl}
                  alt={selectedArtist.artistName}
                  width={40}
                  height={40}
                />
              </div>
            )}
            <div>
              <h3 className='font-medium text-blue-900 dark:text-blue-100 text-sm'>
                {selectedArtist.artistName}
              </h3>
              <p className='text-xs text-blue-700 dark:text-blue-300'>
                Spotify Artist Profile
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error display */}
      {state.error && (
        <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 transition-all duration-200'>
          <div className='flex items-center justify-between'>
            <p className='text-red-800 dark:text-red-200 text-sm' role='alert'>
              {state.error}
            </p>
            <Button
              onClick={retryOperation}
              variant='secondary'
              size='sm'
              disabled={state.retryCount >= 3}
              aria-label='Retry onboarding process'
            >
              {state.retryCount >= 3 ? 'Max retries' : 'Retry'}
            </Button>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className='space-y-4'>
        <FormField
          label='Handle'
          error={validationState.error || undefined}
          helpText='Your unique identifier for your profile URL'
          id='handle-input'
          required
        >
          <Input
            type='text'
            value={handle}
            onChange={e => setHandle(e.target.value)}
            placeholder='your-handle'
            required
            disabled={state.isSubmitting}
            className='font-mono'
            validationState={
              !handle
                ? null
                : validationState.error
                  ? 'invalid'
                  : validationState.isAvailable
                    ? 'valid'
                    : validationState.isChecking
                      ? 'pending'
                      : null
            }
            statusIcon={
              validationState.isAvailable && !validationState.isChecking ? (
                <div className='w-4 h-4 bg-green-500 rounded-full flex items-center justify-center'>
                  <svg
                    className='w-2.5 h-2.5 text-white'
                    fill='currentColor'
                    viewBox='0 0 20 20'
                    aria-hidden='true'
                  >
                    <path
                      fillRule='evenodd'
                      d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
                      clipRule='evenodd'
                    />
                  </svg>
                </div>
              ) : null
            }
            autoCapitalize='none'
            autoCorrect='off'
            autoComplete='off'
            inputMode='text'
            data-test='username-input'
          />

          <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
            Your profile will be live at {displayDomain}/
            <span className='font-medium'>{handle || 'your-handle'}</span>
          </p>

          {/* Username suggestions */}
          {handleValidation.suggestions.length > 0 && (
            <div className='mt-2 space-y-1'>
              <p className='text-xs text-gray-600 dark:text-gray-400'>
                Suggestions:
              </p>
              <div
                className='flex flex-wrap gap-1'
                role='group'
                aria-label='Username suggestions'
              >
                {handleValidation.suggestions.slice(0, 3).map(suggestion => (
                  <button
                    key={suggestion}
                    type='button'
                    onClick={() => setHandle(suggestion)}
                    className='text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors duration-150'
                    disabled={state.isSubmitting}
                    aria-label={`Use suggested handle: ${suggestion}`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </FormField>

        <Button
          type='submit'
          disabled={!validationState.canSubmit || state.isSubmitting}
          variant='primary'
          className='w-full'
          data-test='claim-btn'
          aria-live='polite'
          aria-busy={state.isSubmitting}
        >
          {!state.isSubmitting ? (
            'Create Profile'
          ) : (
            <div className='flex items-center justify-center space-x-2'>
              <LoadingSpinner size='sm' />
              <span>Creating profile...</span>
            </div>
          )}
        </Button>

        {/* Screen reader announcements */}
        <div className='sr-only' aria-live='assertive' aria-atomic='true'>
          {state.isSubmitting ? 'Creating your profile. Please wait...' : ''}
          {state.error ? `Error: ${state.error}` : ''}
        </div>
      </form>
    </div>
  );
}
