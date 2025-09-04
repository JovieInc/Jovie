'use client';

import { useSession, useUser } from '@clerk/nextjs';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { completeOnboarding } from '@/app/onboarding/actions';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { ArtistCard } from '@/components/ui/ArtistCard';
import { Button } from '@/components/ui/Button';
import { ErrorSummary } from '@/components/ui/ErrorSummary';
import { OptimisticProgress } from '@/components/ui/OptimisticProgress';
import { ProgressIndicator } from '@/components/ui/ProgressIndicator';
import {
  type HandleValidationState,
  SmartHandleInput,
} from '@/components/ui/SmartHandleInput';
import { APP_URL } from '@/constants/app';
import {
  getUserFriendlyMessage,
  OnboardingErrorCode,
} from '@/lib/errors/onboarding';
import { useArtistSearch } from '@/lib/hooks/useArtistSearch';

// Progressive form steps
interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  estimatedTimeSeconds: number;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    description: 'Get started',
    estimatedTimeSeconds: 10,
  },
  {
    id: 'artist',
    title: 'Find Artist',
    description: 'Search Spotify',
    estimatedTimeSeconds: 30,
  },
  {
    id: 'handle',
    title: 'Choose Handle',
    description: 'Pick your URL',
    estimatedTimeSeconds: 45,
  },
  {
    id: 'confirm',
    title: 'Confirm',
    description: 'Review & create',
    estimatedTimeSeconds: 15,
  },
];

interface SelectedArtist {
  spotifyId: string;
  artistName: string;
  imageUrl?: string;
  popularity?: number;
  followers?: number;
  spotifyUrl?: string;
  timestamp: number;
}

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
  isSubmitting: boolean;
}

export function ProgressiveOnboardingForm() {
  const { user } = useUser();
  const { session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Extract domain from APP_URL for display
  const displayDomain = APP_URL.replace(/^https?:\/\//, '');

  // Current step in the progressive form
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Form state
  const [handle, setHandle] = useState('');
  const [selectedArtist, setSelectedArtist] = useState<SelectedArtist | null>(
    null
  );
  const [handleValidation, setHandleValidation] =
    useState<HandleValidationState>({
      available: false,
      checking: false,
      error: null,
      clientValid: false,
      suggestions: [],
    });

  // Process state
  const [state, setState] = useState<OnboardingState>({
    step: 'validating',
    progress: 0,
    error: null,
    retryCount: 0,
    isSubmitting: false,
  });

  // Artist search hook
  const {
    searchResults,
    isLoading: isSearching,
    error: searchError,
    searchArtists,
    clearResults,
  } = useArtistSearch();

  // Session monitoring - redirect to sign-in if session expires
  useEffect(() => {
    if (!user || !session) {
      // If user was authenticated but session is now null, redirect
      const wasAuthenticated = sessionStorage.getItem('was_authenticated');
      if (wasAuthenticated) {
        router.push('/sign-in');
        return;
      }
    } else {
      // Mark that user was authenticated
      sessionStorage.setItem('was_authenticated', 'true');
    }
  }, [user, session, router]);

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
        // If we have an artist, skip to handle step
        setCurrentStepIndex(2);
      } catch (error) {
        console.error('Error parsing selected artist:', error);
      }
    }
  }, [searchParams]);

  // Auto-advance to next step when requirements are met
  useEffect(() => {
    if (currentStepIndex === 1 && selectedArtist) {
      // Auto-advance from artist selection to handle step
      setTimeout(() => setCurrentStepIndex(2), 500);
    }
    if (
      currentStepIndex === 2 &&
      handleValidation?.available &&
      handleValidation?.clientValid
    ) {
      // Auto-advance from handle to confirmation when handle is valid and available
      setTimeout(() => setCurrentStepIndex(3), 1000);
    }
  }, [
    currentStepIndex,
    selectedArtist,
    handleValidation?.available,
    handleValidation?.clientValid,
  ]);

  // Navigation handlers with keyboard support and focus management
  const goToNextStep = useCallback(() => {
    if (currentStepIndex < ONBOARDING_STEPS.length - 1) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentStepIndex(currentStepIndex + 1);
        setIsTransitioning(false);
        // Focus management for accessibility
        setTimeout(() => {
          const heading = document.querySelector('h2');
          if (heading) {
            heading.focus();
          }
        }, 100);
      }, 150);
    }
  }, [currentStepIndex]);

  const goToPreviousStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentStepIndex(currentStepIndex - 1);
        setIsTransitioning(false);
        // Focus management for accessibility
        setTimeout(() => {
          const heading = document.querySelector('h2');
          if (heading) {
            heading.focus();
          }
        }, 100);
      }, 150);
    }
  }, [currentStepIndex]);

  // Artist selection handlers
  const handleArtistSelect = useCallback(
    (artist: {
      id: string;
      name: string;
      imageUrl?: string;
      popularity?: number;
      followers?: number;
      spotifyUrl?: string;
    }) => {
      const selectedArtistData: SelectedArtist = {
        spotifyId: artist.id,
        artistName: artist.name,
        imageUrl: artist.imageUrl,
        popularity: artist.popularity,
        followers: artist.followers,
        spotifyUrl: artist.spotifyUrl,
        timestamp: Date.now(),
      };

      setSelectedArtist(selectedArtistData);

      // Store in sessionStorage
      sessionStorage.setItem(
        'selectedArtist',
        JSON.stringify(selectedArtistData)
      );

      // Haptic feedback for mobile
      if ('vibrate' in navigator) {
        navigator.vibrate(50); // Light haptic feedback
      }
    },
    []
  );

  const handleSkipArtist = useCallback(() => {
    setSelectedArtist(null);
    sessionStorage.removeItem('selectedArtist');
    goToNextStep();
  }, [goToNextStep]);

  // Handle validation callback
  const handleValidationChange = useCallback(
    (validation: HandleValidationState) => {
      setHandleValidation(validation);
    },
    []
  );

  // Form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (
        !user ||
        state.isSubmitting ||
        !handleValidation?.available ||
        !handleValidation?.clientValid
      )
        return;

      setState(prev => ({
        ...prev,
        error: null,
        step: 'validating',
        progress: 0,
        isSubmitting: true,
      }));

      try {
        await completeOnboarding({
          username: handle.toLowerCase(),
          displayName: selectedArtist?.artistName || handle,
        });

        setState(prev => ({ ...prev, step: 'complete', progress: 100 }));

        // Clear session data
        sessionStorage.removeItem('selectedArtist');
        sessionStorage.removeItem('pendingClaim');

        // Success haptic feedback
        if ('vibrate' in navigator) {
          navigator.vibrate([100, 50, 100]); // Success vibration pattern
        }

        // Success animation before redirect
        setTimeout(() => {
          router.push('/dashboard');
        }, 2000);
      } catch (error) {
        console.error('Onboarding error:', error);

        if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
          setState(prev => ({ ...prev, step: 'complete', progress: 100 }));
          return;
        }

        // Map error to user-friendly message
        let userMessage = 'An unexpected error occurred';
        let shouldRetry = true;

        if (error instanceof Error) {
          // Check if it's a database/auth error that can be mapped
          if (
            error.message.includes('Authentication session expired') ||
            error.message.includes('JWT') ||
            error.message.includes('PGRST301')
          ) {
            userMessage = getUserFriendlyMessage(
              OnboardingErrorCode.INVALID_SESSION
            );
            shouldRetry = false; // Don't retry, redirect instead
            // Redirect to sign-in
            setTimeout(() => {
              router.push('/sign-in');
            }, 2000);
          } else if (
            error.message.includes('Username is already taken') ||
            error.message.includes('already taken')
          ) {
            userMessage = getUserFriendlyMessage(
              OnboardingErrorCode.USERNAME_TAKEN
            );
            shouldRetry = false; // User needs to choose a different username
          } else if (
            error.message.includes('Too many attempts') ||
            error.message.includes('rate limit')
          ) {
            userMessage = getUserFriendlyMessage(
              OnboardingErrorCode.RATE_LIMITED
            );
            shouldRetry = true;
          } else {
            // Use the original error message if it's user-friendly enough
            userMessage =
              error.message.length > 100
                ? 'An unexpected error occurred. Please try again.'
                : error.message;
          }
        }

        setState(prev => ({
          ...prev,
          error: userMessage,
          step: shouldRetry ? 'validating' : 'checking-handle', // Go back to handle step for username issues
          progress: shouldRetry ? 0 : 50,
          isSubmitting: false,
        }));
      }
    },
    [
      user,
      handle,
      selectedArtist,
      state.isSubmitting,
      handleValidation.available,
      handleValidation.clientValid,
      router,
    ]
  );

  // Step validation
  const canProceedToNextStep = useMemo(() => {
    switch (currentStepIndex) {
      case 0: // Welcome step
        return true;
      case 1: // Artist step
        return selectedArtist !== null;
      case 2: // Handle step
        return handleValidation?.available && handleValidation?.clientValid;
      case 3: // Confirm step
        return handleValidation?.available && handleValidation?.clientValid;
      default:
        return false;
    }
  }, [
    currentStepIndex,
    selectedArtist,
    handleValidation?.available,
    handleValidation?.clientValid,
  ]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle navigation keys when not in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowRight':
        case 'Enter':
          if (
            canProceedToNextStep &&
            currentStepIndex < ONBOARDING_STEPS.length - 1
          ) {
            e.preventDefault();
            goToNextStep();
          }
          break;
        case 'ArrowLeft':
        case 'Escape':
          if (currentStepIndex > 0) {
            e.preventDefault();
            goToPreviousStep();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [canProceedToNextStep, currentStepIndex, goToNextStep, goToPreviousStep]);

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

  // Render step content
  const renderStepContent = () => {
    switch (currentStepIndex) {
      case 0: // Welcome step
        return (
          <div className='text-center space-y-6'>
            <div className='space-y-2'>
              <h2
                className='text-2xl font-semibold text-gray-900 dark:text-white'
                tabIndex={-1}
              >
                Welcome to Jovie! 🎵
              </h2>
              <p className='text-gray-600 dark:text-gray-400'>
                Let&apos;s create your artist profile in just a few simple
                steps.
              </p>
            </div>

            <div className='bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 space-y-2'>
              <h3 className='font-medium text-blue-900 dark:text-blue-100'>
                What you&apos;ll get:
              </h3>
              <ul className='text-sm text-blue-800 dark:text-blue-200 space-y-1'>
                <li>• Your own jovie.link/yourname URL</li>
                <li>• Professional artist profile page</li>
                <li>• Direct fan engagement tools</li>
                <li>• Analytics and insights</li>
              </ul>
            </div>

            <Button
              onClick={goToNextStep}
              variant='primary'
              className='w-full min-h-[48px]' // Mobile-first touch target
              size='lg'
            >
              Get Started
            </Button>
          </div>
        );

      case 1: // Artist selection step
        return (
          <div className='space-y-6'>
            <div className='text-center space-y-2'>
              <h2
                className='text-2xl font-semibold text-gray-900 dark:text-white'
                tabIndex={-1}
              >
                Find Your Artist Profile
              </h2>
              <p className='text-gray-600 dark:text-gray-400'>
                Search for your artist profile on Spotify to connect your music.
              </p>
            </div>

            {/* Artist search */}
            <div className='space-y-4'>
              <div className='relative'>
                <input
                  type='text'
                  placeholder='Search for your artist name...'
                  onChange={e => {
                    const value = e.target.value;
                    if (value.trim()) {
                      searchArtists(value);
                    } else {
                      clearResults();
                    }
                  }}
                  className='w-full px-4 py-3 pl-12 text-base bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent'
                  autoFocus
                />
                <div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
                  <svg
                    className='h-5 w-5 text-gray-400'
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke='currentColor'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'
                    />
                  </svg>
                </div>
              </div>

              {/* Search results */}
              {isSearching && (
                <div className='flex items-center justify-center py-8'>
                  <LoadingSpinner size='md' />
                </div>
              )}

              {searchError && (
                <div className='text-center py-4 text-red-600 dark:text-red-400'>
                  {searchError}
                </div>
              )}

              {searchResults.length > 0 && (
                <div className='space-y-3 max-h-96 overflow-y-auto'>
                  {searchResults.slice(0, 5).map(artist => (
                    <ArtistCard
                      key={artist.id}
                      id={artist.id}
                      name={artist.name}
                      imageUrl={artist.imageUrl}
                      popularity={artist.popularity}
                      followers={artist.followers}
                      spotifyUrl={artist.spotifyUrl}
                      isSelected={selectedArtist?.spotifyId === artist.id}
                      onSelect={() => handleArtistSelect(artist)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className='flex flex-col sm:flex-row gap-3 sm:gap-0 sm:justify-between'>
              <Button
                onClick={goToPreviousStep}
                variant='secondary'
                className='w-full sm:flex-1 sm:mr-2 min-h-[48px]' // Mobile-first touch target
              >
                Back
              </Button>
              <Button
                onClick={handleSkipArtist}
                variant='outline'
                className='w-full sm:flex-1 sm:ml-2 min-h-[48px]' // Mobile-first touch target
              >
                Skip for Now
              </Button>
            </div>
          </div>
        );

      case 2: // Handle selection step
        return (
          <div className='space-y-6'>
            <div className='text-center space-y-2'>
              <h2
                className='text-2xl font-semibold text-gray-900 dark:text-white'
                tabIndex={-1}
              >
                Choose Your Handle
              </h2>
              <p className='text-gray-600 dark:text-gray-400'>
                This will be your unique jovie.link URL that fans use to find
                you.
              </p>
            </div>

            {/* Selected artist display */}
            {selectedArtist && (
              <div className='bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4'>
                <div className='flex items-center space-x-3'>
                  {selectedArtist.imageUrl && (
                    <div className='w-12 h-12 rounded-full overflow-hidden'>
                      <Image
                        src={selectedArtist.imageUrl}
                        alt={selectedArtist.artistName}
                        width={48}
                        height={48}
                        className='w-full h-full object-cover'
                      />
                    </div>
                  )}
                  <div>
                    <h3 className='font-medium text-green-900 dark:text-green-100'>
                      {selectedArtist.artistName}
                    </h3>
                    <p className='text-sm text-green-700 dark:text-green-300'>
                      Connected Spotify Artist
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Smart handle input */}
            <SmartHandleInput
              value={handle}
              onChange={setHandle}
              onValidationChange={handleValidationChange}
              prefix={`${displayDomain}/`}
              placeholder='yourname'
              artistName={selectedArtist?.artistName}
              showAvailability={true}
              formatHints={true}
            />

            {/* Navigation */}
            <div className='flex flex-col sm:flex-row gap-3 sm:gap-0 sm:justify-between'>
              <Button
                onClick={goToPreviousStep}
                variant='secondary'
                className='w-full sm:flex-1 sm:mr-2 min-h-[48px]' // Mobile-first touch target
              >
                Back
              </Button>
              <Button
                onClick={goToNextStep}
                variant='primary'
                className='w-full sm:flex-1 sm:ml-2 min-h-[48px]' // Mobile-first touch target
                disabled={!canProceedToNextStep}
              >
                Continue
              </Button>
            </div>
          </div>
        );

      case 3: // Confirmation step
        return (
          <div className='space-y-6'>
            <div className='text-center space-y-2'>
              <h2
                className='text-2xl font-semibold text-gray-900 dark:text-white'
                tabIndex={-1}
              >
                Almost Done! 🎉
              </h2>
              <p className='text-gray-600 dark:text-gray-400'>
                Review your profile details and create your account.
              </p>
            </div>

            {/* Profile preview */}
            <div className='bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800'>
              <h3 className='font-semibold text-gray-900 dark:text-white mb-4'>
                Your Profile Preview
              </h3>

              <div className='bg-white dark:bg-gray-800 rounded-lg p-4 space-y-4'>
                {/* Profile header */}
                <div className='flex items-center space-x-4'>
                  {selectedArtist?.imageUrl ? (
                    <div className='w-16 h-16 rounded-full overflow-hidden'>
                      <Image
                        src={selectedArtist.imageUrl}
                        alt={selectedArtist.artistName}
                        width={64}
                        height={64}
                        className='w-full h-full object-cover'
                      />
                    </div>
                  ) : (
                    <div className='w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-xl'>
                      {(selectedArtist?.artistName || handle)
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h4 className='font-semibold text-gray-900 dark:text-white text-lg'>
                      {selectedArtist?.artistName || handle}
                    </h4>
                    <p className='text-gray-600 dark:text-gray-400'>
                      {displayDomain}/{handle}
                    </p>
                  </div>
                </div>

                {/* Profile details */}
                <div className='border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2'>
                  <div className='flex justify-between text-sm'>
                    <span className='text-gray-600 dark:text-gray-400'>
                      Handle:
                    </span>
                    <span className='font-mono text-gray-900 dark:text-white'>
                      @{handle}
                    </span>
                  </div>
                  <div className='flex justify-between text-sm'>
                    <span className='text-gray-600 dark:text-gray-400'>
                      Profile URL:
                    </span>
                    <span className='font-mono text-blue-600 dark:text-blue-400'>
                      {displayDomain}/{handle}
                    </span>
                  </div>
                  {selectedArtist && (
                    <div className='flex justify-between text-sm'>
                      <span className='text-gray-600 dark:text-gray-400'>
                        Spotify Artist:
                      </span>
                      <span className='text-gray-900 dark:text-white'>
                        Connected
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Final submission */}
            <form onSubmit={handleSubmit} className='space-y-4'>
              <Button
                type='submit'
                disabled={!canProceedToNextStep || state.isSubmitting}
                variant='primary'
                className='w-full min-h-[48px]' // Mobile-first touch target
                size='lg'
              >
                {!state.isSubmitting ? (
                  'Create My Profile'
                ) : (
                  <div className='flex items-center justify-center space-x-2'>
                    <LoadingSpinner size='sm' />
                    <span>Creating profile...</span>
                  </div>
                )}
              </Button>

              <Button
                type='button'
                onClick={goToPreviousStep}
                variant='secondary'
                className='w-full min-h-[48px]' // Mobile-first touch target
                disabled={state.isSubmitting}
              >
                Back to Edit Handle
              </Button>
            </form>
          </div>
        );

      default:
        return null;
    }
  };

  // Collect all form errors for the error summary
  const formErrors = useMemo(() => {
    const errors: Record<string, string> = {};

    // Handle validation errors
    if (currentStepIndex === 2 && handleValidation?.error) {
      errors.handle = handleValidation.error;
    } else if (
      currentStepIndex === 2 &&
      !handleValidation?.available &&
      handle
    ) {
      errors.handle = 'Handle already taken';
    }

    // Include API error if present
    if (state.error) {
      errors.form = state.error;
    }

    return errors;
  }, [
    currentStepIndex,
    handleValidation?.error,
    handleValidation?.available,
    handle,
    state.error,
  ]);

  return (
    <div className='space-y-6' role='main' aria-label='Onboarding form'>
      {/* Skip link for accessibility */}
      <a
        href='#main-content'
        className='sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-4 focus-visible:left-4 bg-blue-600 text-white px-4 py-2 rounded-md z-50'
      >
        Skip to main content
      </a>

      {/* Screen reader announcements */}
      <div className='sr-only' aria-live='polite' aria-atomic='true'>
        Step {currentStepIndex + 1} of {ONBOARDING_STEPS.length}:{' '}
        {ONBOARDING_STEPS[currentStepIndex]?.title}
      </div>

      {/* Progress indicator */}
      <ProgressIndicator
        currentStep={currentStepIndex}
        totalSteps={ONBOARDING_STEPS.length}
        steps={ONBOARDING_STEPS}
        showTimeEstimate={true}
      />

      {/* Optimistic Progress during submission */}
      {state.isSubmitting && (
        <OptimisticProgress
          isActive={state.isSubmitting}
          steps={progressSteps}
          onComplete={() => {
            // Progress complete, waiting for server redirect
          }}
        />
      )}

      {/* Error display - only show session expiry errors here, others in ErrorSummary */}
      {state.error && state.error.includes('session') && (
        <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 transition-all duration-200'>
          <div className='flex items-center justify-between'>
            <p className='text-red-800 dark:text-red-200 text-sm' role='alert'>
              {state.error}
            </p>
            <Button
              onClick={() => router.push('/sign-in')}
              variant='primary'
              size='sm'
              aria-label='Go to sign in'
            >
              Sign In
            </Button>
          </div>
        </div>
      )}

      {/* Screen reader announcements */}
      <div
        className='sr-only'
        aria-live='assertive'
        aria-atomic='true'
        id='step-announcement'
      >
        {isTransitioning
          ? `Moving to ${ONBOARDING_STEPS[currentStepIndex]?.title} step`
          : ''}
        {state.error ? `Error: ${state.error}` : ''}
        {state.isSubmitting ? 'Creating your profile. Please wait...' : ''}
      </div>

      {/* Error summary for screen readers - exclude session errors shown above */}
      {Object.keys(formErrors || {}).filter(
        errorKey => !(formErrors[errorKey] || '').includes('session')
      ).length > 0 && (
        <ErrorSummary
          errors={Object.fromEntries(
            Object.entries(formErrors || {}).filter(
              ([, value]) => !(value || '').includes('session')
            )
          )}
          title='Please fix the following errors before continuing'
          onFocusField={fieldName => {
            const element = document.getElementById(fieldName);
            if (element) {
              element.focus();
            }
          }}
        />
      )}

      {/* Step content with smooth transitions */}
      <div
        className='min-h-[400px] flex items-start'
        role='region'
        aria-labelledby='step-heading'
        id='main-content'
      >
        <div className='w-full'>
          <div id='step-heading' className='sr-only'>
            {ONBOARDING_STEPS[currentStepIndex]?.title} step content
          </div>
          <div
            className={`transform transition-all duration-300 ease-in-out ${
              isTransitioning ? 'opacity-50 scale-95' : 'opacity-100 scale-100'
            }`}
          >
            {renderStepContent()}
          </div>
        </div>
      </div>

      {/* Success completion */}
      {state.step === 'complete' && (
        <div className='text-center space-y-4 py-8'>
          <div className='w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto'>
            <svg
              className='w-8 h-8 text-white'
              fill='currentColor'
              viewBox='0 0 20 20'
            >
              <path
                fillRule='evenodd'
                d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
                clipRule='evenodd'
              />
            </svg>
          </div>
          <h2 className='text-2xl font-semibold text-gray-900 dark:text-white'>
            Profile Created Successfully!
          </h2>
          <p className='text-gray-600 dark:text-gray-400'>
            Redirecting you to your dashboard...
          </p>
        </div>
      )}
    </div>
  );
}
