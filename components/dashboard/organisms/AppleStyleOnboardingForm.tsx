'use client';

import { Button } from '@jovie/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { completeOnboarding } from '@/app/onboarding/actions';
import { Input } from '@/components/atoms/Input';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { identify, track } from '@/lib/analytics';
import { getBaseUrl } from '@/lib/utils/platform-detection';

interface AppleStyleOnboardingFormProps {
  initialDisplayName?: string;
  initialHandle?: string;
  userEmail?: string | null;
  userId: string;
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

interface HandleValidationState {
  available: boolean;
  checking: boolean;
  error: string | null;
  clientValid: boolean;
  suggestions: string[];
}

const ONBOARDING_STEPS = [
  {
    id: 'name',
    title: "What's your name?",
    prompt: 'This will show on your Jovie profile.',
  },
  {
    id: 'handle',
    title: 'Pick your @handle',
    prompt: 'This becomes your Jovie link.',
  },
  { id: 'done', title: "You're live.", prompt: "Here's your link." },
] as const;

export function AppleStyleOnboardingForm({
  initialDisplayName = '',
  initialHandle = '',
  userEmail = null,
  userId,
}: AppleStyleOnboardingFormProps) {
  const router = useRouter();

  const normalizedInitialHandle = initialHandle.trim().toLowerCase();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [handle, setHandle] = useState(normalizedInitialHandle);
  const [handleInput, setHandleInput] = useState(normalizedInitialHandle);
  const [fullName, setFullName] = useState(initialDisplayName);
  const [profileReadyHandle, setProfileReadyHandle] = useState(
    normalizedInitialHandle
  );
  const [state, setState] = useState<OnboardingState>({
    step: 'validating',
    progress: 0,
    error: null,
    retryCount: 0,
    isSubmitting: false,
  });

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

  const profileBaseUrl = getBaseUrl();
  const displayDomain = profileBaseUrl
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');

  useEffect(() => {
    if (userId) {
      track('onboarding_started', {
        user_id: userId,
        timestamp: new Date().toISOString(),
      });
    }
  }, [userId]);

  const goToNextStep = useCallback(() => {
    if (currentStepIndex >= ONBOARDING_STEPS.length - 1) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStepIndex(prev => prev + 1);
      setIsTransitioning(false);
    }, 250);
  }, [currentStepIndex]);

  const goToPreviousStep = useCallback(() => {
    if (currentStepIndex === 0) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStepIndex(prev => prev - 1);
      setIsTransitioning(false);
    }, 250);
  }, [currentStepIndex]);

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

      // Basic client validation
      if (!normalizedInput || normalizedInput.length < 3) {
        setHandleValidation({
          available: false,
          checking: false,
          error: 'Handle must be at least 3 characters.',
          clientValid: false,
          suggestions: [],
        });
        return;
      }

      if (normalizedInput.length > 30) {
        setHandleValidation({
          available: false,
          checking: false,
          error: 'Keep it under 30 characters.',
          clientValid: false,
          suggestions: [],
        });
        return;
      }

      if (!/^[a-zA-Z0-9-]+$/.test(normalizedInput)) {
        setHandleValidation({
          available: false,
          checking: false,
          error: 'Letters, numbers, and hyphens only.',
          clientValid: false,
          suggestions: [],
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
          setHandleValidation({
            available: false,
            checking: false,
            error: data.error || 'Handle already taken',
            clientValid: true,
            suggestions: [],
          });
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        setHandleValidation({
          available: false,
          checking: false,
          error: 'Unable to check handle right now.',
          clientValid: true,
          suggestions: [],
        });
      }
    },
    [normalizedInitialHandle]
  );

  useEffect(() => {
    if (!handleInput) {
      setHandleValidation({
        available: false,
        checking: false,
        error: null,
        clientValid: false,
        suggestions: [],
      });
      return;
    }

    const timer = setTimeout(() => {
      void validateHandle(handleInput);
    }, 400);

    return () => {
      clearTimeout(timer);
      abortController.current?.abort();
    };
  }, [handleInput, validateHandle]);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();

      const resolvedHandle = (handle || handleInput).trim().toLowerCase();
      const resolvedName = fullName.trim() || resolvedHandle;

      if (
        state.isSubmitting ||
        !handleValidation.clientValid ||
        !handleValidation.available ||
        !resolvedHandle
      ) {
        return;
      }

      track('onboarding_submission_started', {
        user_id: userId,
        handle: resolvedHandle,
      });

      identify(userId, {
        email: userEmail ?? undefined,
        handle: resolvedHandle,
        onboarding_started_at: new Date().toISOString(),
      });

      setState(prev => ({
        ...prev,
        error: null,
        step: 'validating',
        progress: 0,
        isSubmitting: true,
      }));

      try {
        await completeOnboarding({
          username: resolvedHandle,
          displayName: resolvedName,
          email: userEmail,
          redirectToDashboard: false,
        });

        setState(prev => ({ ...prev, step: 'complete', progress: 100 }));
        setProfileReadyHandle(resolvedHandle);

        track('onboarding_completed', {
          user_id: userId,
          handle: resolvedHandle,
          completion_time: new Date().toISOString(),
        });

        goToNextStep();
      } catch (error) {
        if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
          setState(prev => ({ ...prev, step: 'complete', progress: 100 }));
          return;
        }

        track('onboarding_error', {
          user_id: userId,
          handle: resolvedHandle,
          error_message:
            error instanceof Error ? error.message : 'Unknown error',
          error_step: 'submission',
          timestamp: new Date().toISOString(),
        });

        let userMessage =
          'Something went wrong saving your handle. Please try again.';
        if (error instanceof Error) {
          if (error.message.includes('INVALID_SESSION')) {
            userMessage = 'Your session expired. Please refresh and try again.';
          } else if (error.message.includes('USERNAME_TAKEN')) {
            userMessage =
              'This handle is already taken. Please choose another one.';
          } else if (error.message.includes('RATE_LIMITED')) {
            userMessage =
              'Too many attempts. Please try again in a few moments.';
          }
        }

        setState(prev => ({
          ...prev,
          error: userMessage,
          step: 'validating',
          progress: 0,
          isSubmitting: false,
        }));
      }
    },
    [
      fullName,
      goToNextStep,
      handle,
      handleInput,
      handleValidation.available,
      handleValidation.clientValid,
      state.isSubmitting,
      userEmail,
      userId,
    ]
  );

  const copyProfileLink = useCallback(() => {
    const targetHandle = profileReadyHandle || handle || handleInput;
    const link = `${getBaseUrl().replace(/\/$/, '')}/${targetHandle}`;
    navigator.clipboard
      .writeText(link)
      .then(() => {
        setState(prev => ({ ...prev, error: 'Link copied to clipboard!' }));
        setTimeout(() => {
          setState(prev => ({ ...prev, error: null }));
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy link:', err);
      });
  }, [handle, handleInput, profileReadyHandle]);

  const goToDashboard = useCallback(() => {
    router.push('/dashboard/overview');
    router.refresh();
  }, [router]);

  const retryOperation = useCallback(() => {
    setState(prev => ({
      ...prev,
      retryCount: prev.retryCount + 1,
      error: null,
    }));
  }, []);

  const renderStepContent = () => {
    switch (currentStepIndex) {
      case 0:
        return (
          <div className='flex flex-col items-center justify-center h-full space-y-8'>
            <div className='text-center space-y-3'>
              <h1 className='text-4xl font-bold text-(--fg) transition-colors'>
                {ONBOARDING_STEPS[0].title}
              </h1>
              <p className='text-(--muted) text-xl'>
                {ONBOARDING_STEPS[0].prompt}
              </p>
            </div>

            <div className='w-full max-w-md space-y-6'>
              <div className='space-y-4'>
                <label
                  className='text-sm font-medium text-(--muted)'
                  htmlFor='display-name'
                >
                  Your name
                </label>
                <Input
                  id='display-name'
                  type='text'
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder='Your full name'
                  inputClassName='w-full px-4 py-4 text-lg bg-(--panel) border-2 border-(--border) rounded-xl focus-ring text-(--fg) transition-all'
                  maxLength={50}
                  autoComplete='name'
                />

                <Button
                  onClick={goToNextStep}
                  disabled={!fullName.trim()}
                  variant='primary'
                  className='w-full py-4 text-lg rounded-xl transition-all duration-300 ease-in-out hover:scale-[1.02] active:scale-[0.98]'
                >
                  Continue
                </Button>
              </div>

              <button
                onClick={goToPreviousStep}
                className='w-full text-center text-(--muted) hover:text-(--fg) py-2 text-sm transition-colors'
              >
                Back
              </button>
            </div>
          </div>
        );

      case 1:
        return (
          <div className='flex flex-col items-center justify-center h-full space-y-8'>
            <div className='text-center space-y-3'>
              <h1 className='text-4xl font-bold text-[var(--fg)] transition-colors'>
                {ONBOARDING_STEPS[1].title}
              </h1>
              <p className='text-[var(--muted)] text-xl'>
                {ONBOARDING_STEPS[1].prompt}
              </p>
            </div>

            <div className='w-full max-w-md space-y-6'>
              <div className='space-y-4'>
                <label
                  className='text-sm font-medium text-[var(--muted)]'
                  htmlFor='handle-input'
                >
                  Enter your desired handle
                </label>
                <div className='relative'>
                  <Input
                    id='handle-input'
                    aria-label='Enter your desired handle'
                    type='text'
                    value={handleInput}
                    onChange={e => setHandleInput(e.target.value.toLowerCase())}
                    placeholder='yourhandle'
                    autoComplete='username'
                    inputClassName={`w-full px-4 py-4 text-lg bg-(--panel) border-2 rounded-xl transition-all ${
                      handleValidation.error
                        ? 'border-red-500'
                        : handleValidation.available
                          ? 'border-green-500'
                          : 'border-(--border)'
                    } focus-ring text-(--fg)`}
                  />
                  {handleValidation.checking && (
                    <div className='absolute right-3 top-1/2 transform -translate-y-1/2'>
                      <LoadingSpinner size='sm' className='text-gray-400' />
                    </div>
                  )}
                </div>

                <div className='text-center p-3 bg-(--panel) rounded-xl border border-(--border)'>
                  <p className='text-(--muted) text-sm'>Your profile link</p>
                  <p className='font-mono text-(--fg)'>
                    {displayDomain}/{handleInput || 'yourhandle'}
                  </p>
                </div>

                <div className='min-h-[24px] flex items-center px-1'>
                  {handleValidation.error && (
                    <div className='text-red-500 text-sm animate-in fade-in slide-in-from-top-1 duration-300'>
                      {handleValidation.error}
                    </div>
                  )}
                  {handleValidation.available &&
                    handleValidation.clientValid && (
                      <div className='flex items-center gap-2 text-green-600 text-sm animate-in fade-in slide-in-from-bottom-1 duration-300'>
                        <span className='inline-flex h-3 w-3 rounded-full bg-green-500' />
                        <span className='font-medium'>Handle is available</span>
                      </div>
                    )}
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={
                    !handleValidation.available ||
                    !handleValidation.clientValid ||
                    state.isSubmitting
                  }
                  variant='primary'
                  className='w-full py-4 text-lg rounded-xl transition-all duration-300 ease-in-out hover:scale-[1.02] active:scale-[0.98]'
                >
                  {state.isSubmitting ? (
                    <div className='flex items-center justify-center space-x-2'>
                      <LoadingSpinner size='sm' className='text-current' />
                      <span>Saving…</span>
                    </div>
                  ) : (
                    'Create Profile'
                  )}
                </Button>
              </div>

              {state.error && (
                <ErrorBanner
                  title='We could not save your handle'
                  description={state.error}
                  actions={[
                    {
                      label: 'Try again',
                      onClick: retryOperation,
                    },
                    {
                      label: 'Contact support',
                      href: '/support',
                    },
                  ]}
                  testId='onboarding-error'
                />
              )}

              <button
                onClick={goToPreviousStep}
                className='w-full text-center text-(--muted) hover:text-(--fg) py-2 text-sm transition-colors'
              >
                Back
              </button>
            </div>
          </div>
        );

      case 2:
        return (
          <div className='flex flex-col items-center justify-center h-full space-y-8'>
            <div className='text-center space-y-3'>
              <h1 className='text-4xl font-bold text-[var(--fg)] transition-colors'>
                {ONBOARDING_STEPS[2].title}
              </h1>
              <p className='text-[var(--muted)] text-xl'>
                {ONBOARDING_STEPS[2].prompt}
              </p>
            </div>

            <div className='w-full max-w-md space-y-6'>
              <div className='text-center p-4 bg-(--panel) border border-(--border) rounded-xl'>
                <p className='font-mono text-lg text-(--fg)'>
                  {displayDomain}/{profileReadyHandle || handle}
                </p>
              </div>

              <div className='space-y-3'>
                <Button
                  onClick={goToDashboard}
                  variant='primary'
                  className='w-full py-4 text-lg rounded-xl'
                >
                  Go to Dashboard
                </Button>

                <Button
                  onClick={copyProfileLink}
                  variant='secondary'
                  className='w-full py-4 text-lg rounded-xl'
                >
                  Copy Link
                </Button>
              </div>

              {state.error && (
                <div className='p-3 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/50 rounded-xl text-green-600 dark:text-green-400 text-sm text-center'>
                  {state.error}
                </div>
              )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const ProgressIndicator = () => {
    return (
      <div className='fixed top-0 left-0 right-0 z-50'>
        <div className='h-1 bg-(--border)'>
          <div
            className='h-full bg-(--accent-pro) transition-all duration-500 ease-in-out'
            style={{
              width: `${((currentStepIndex + 1) / ONBOARDING_STEPS.length) * 100}%`,
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className='min-h-screen flex flex-col'>
      <ProgressIndicator />

      <a
        href='#main-content'
        className='sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-4 focus-visible:left-4 px-4 py-2 rounded-md z-50 btn btn-primary btn-sm'
      >
        Skip to main content
      </a>

      <div className='sr-only' aria-live='polite' aria-atomic='true'>
        Step {currentStepIndex + 1} of {ONBOARDING_STEPS.length}:{' '}
        {ONBOARDING_STEPS[currentStepIndex]?.title}
      </div>

      <main
        className='flex-1 flex items-center justify-center px-4'
        id='main-content'
        role='main'
        aria-labelledby='step-heading'
      >
        <div id='step-heading' className='sr-only'>
          {ONBOARDING_STEPS[currentStepIndex]?.title} step content
        </div>
        <div
          className={`w-full max-w-2xl transform transition-all duration-500 ease-in-out ${
            isTransitioning
              ? 'opacity-0 translate-y-4'
              : 'opacity-100 translate-y-0'
          }`}
        >
          {renderStepContent()}
        </div>
      </main>
    </div>
  );
}
