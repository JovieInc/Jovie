'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { completeOnboarding } from '@/app/onboarding/actions';
import {
  AuthBackButton,
  AuthButton,
  AuthLinkPreviewCard,
  AuthTextInput,
} from '@/components/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PROFILE_HOSTNAME, PROFILE_URL } from '@/constants/domains';
import { identify, track } from '@/lib/analytics';
import {
  generateUsernameSuggestions,
  validateUsernameFormat,
} from '@/lib/validation/client-username';

interface AppleStyleOnboardingFormProps {
  initialDisplayName?: string;
  initialHandle?: string;
  userEmail?: string | null;
  userId: string;
  skipNameStep?: boolean;
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
    title: 'What should we call you?',
    prompt: '',
  },
  {
    id: 'handle',
    title: 'Claim your handle',
    prompt: '',
  },
  { id: 'done', title: "You're live.", prompt: '' },
] as const;

export function AppleStyleOnboardingForm({
  initialDisplayName = '',
  initialHandle = '',
  userEmail = null,
  userId,
  skipNameStep = false,
}: AppleStyleOnboardingFormProps) {
  const router = useRouter();

  const PRODUCTION_PROFILE_DOMAIN = PROFILE_HOSTNAME;
  const PRODUCTION_PROFILE_BASE_URL = PROFILE_URL;

  const normalizedInitialHandle = initialHandle.trim().toLowerCase();
  const [currentStepIndex, setCurrentStepIndex] = useState(
    skipNameStep ? 1 : 0
  );
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [handle, setHandle] = useState(normalizedInitialHandle);
  const [handleInput, setHandleInput] = useState(normalizedInitialHandle);
  const [fullName, setFullName] = useState(initialDisplayName);
  const [profileReadyHandle, setProfileReadyHandle] = useState(
    normalizedInitialHandle
  );
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
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
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const handleInputRef = useRef<HTMLInputElement | null>(null);

  const displayDomain = PRODUCTION_PROFILE_DOMAIN;

  const namePlaceholder = useMemo(() => {
    const options = [
      'Madonna',
      'BLACKPINK',
      'Tiësto',
      'FISHER',
      'Neon Hitch',
      'U2',
      'Imagine Dragons',
      'ODESZA',
    ];
    return options[Math.floor(Math.random() * options.length)];
  }, []);

  const isDisplayNameValid = useMemo(() => {
    const trimmed = fullName.trim();
    return trimmed.length > 0 && trimmed.length <= 50;
  }, [fullName]);

  useEffect(() => {
    if (userId) {
      track('onboarding_started', {
        user_id: userId,
        timestamp: new Date().toISOString(),
      });
    }
  }, [userId]);

  // Step-based autofocus for keyboard-only users
  useEffect(() => {
    const target =
      currentStepIndex === 0 ? nameInputRef.current : handleInputRef.current;
    if (target) {
      target.focus();
    }
  }, [currentStepIndex]);

  const goToNextStep = useCallback(() => {
    if (isTransitioning) return;
    if (currentStepIndex >= ONBOARDING_STEPS.length - 1) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStepIndex(prev => prev + 1);
      setIsTransitioning(false);
    }, 250);
  }, [currentStepIndex, isTransitioning]);

  const goToPreviousStep = useCallback(() => {
    if (isTransitioning) return;
    if (currentStepIndex === 0) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStepIndex(prev => prev - 1);
      setIsTransitioning(false);
    }, 250);
  }, [currentStepIndex, isTransitioning]);

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

      // Basic client validation aligned with server rules
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

  const handleStepCtaDisabledReason = useMemo(() => {
    if (state.isSubmitting) return 'Saving…';
    if (state.error) return state.error;
    if (!handleInput) return 'Enter a handle to continue';
    if (!handleValidation.clientValid) {
      return handleValidation.error || 'Handle is invalid';
    }
    if (handleValidation.checking) return 'Checking availability…';
    if (!handleValidation.available) {
      return handleValidation.error || 'Handle is taken';
    }
    return null;
  }, [handleInput, handleValidation, state.error, state.isSubmitting]);

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

      const redirectUrl = `/onboarding?handle=${encodeURIComponent(resolvedHandle)}`;

      if (
        state.isSubmitting ||
        Boolean(state.error) ||
        !handleValidation.clientValid ||
        handleValidation.checking ||
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
        isSubmitting: true,
      }));

      try {
        const trimmedName = fullName.trim();
        if (!trimmedName) {
          throw new Error('[DISPLAY_NAME_REQUIRED] Display name is required');
        }
        await completeOnboarding({
          username: resolvedHandle,
          displayName: trimmedName,
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

        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const errorCodeMatch =
          error instanceof Error ? error.message.match(/^\[([A-Z_]+)\]/) : null;
        const errorCode = errorCodeMatch?.[1];

        track('onboarding_error', {
          user_id: userId,
          handle: resolvedHandle,
          error_message: errorMessage,
          error_code: errorCode,
          error_step: 'submission',
          timestamp: new Date().toISOString(),
        });

        let userMessage = 'Could not save. Please try again.';
        const message = errorMessage.toUpperCase();
        if (message.includes('INVALID_SESSION')) {
          userMessage = 'Could not save. Please refresh and try again.';
        } else if (message.includes('USERNAME_TAKEN')) {
          userMessage = 'Not available. Try another handle.';
        } else if (message.includes('EMAIL_IN_USE')) {
          userMessage =
            'This email is already in use. Please sign in with the original account or use a different email.';
          router.push(
            `/signin?redirect_url=${encodeURIComponent(redirectUrl)}`
          );
          return;
        } else if (
          message.includes('RATE_LIMITED') ||
          message.includes('TOO_MANY_ATTEMPTS')
        ) {
          userMessage = 'Too many attempts. Please try again in a few moments.';
        } else if (
          message.includes('INVALID_USERNAME') ||
          message.includes('USERNAME_RESERVED') ||
          message.includes('USERNAME_INVALID_FORMAT') ||
          message.includes('USERNAME_TOO_SHORT') ||
          message.includes('USERNAME_TOO_LONG')
        ) {
          userMessage = 'That handle can’t be used. Try another one.';
        } else if (message.includes('DISPLAY_NAME_REQUIRED')) {
          userMessage = 'Please enter your name to continue.';
        }

        if (
          process.env.NODE_ENV === 'development' &&
          userMessage === 'Could not save. Please try again.' &&
          errorCode
        ) {
          userMessage = `Could not save (${errorCode}). Please try again.`;
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
      handleValidation.checking,
      handleValidation.clientValid,
      router,
      state.error,
      state.isSubmitting,
      userEmail,
      userId,
    ]
  );

  const copyProfileLink = useCallback(() => {
    const targetHandle = profileReadyHandle || handle || handleInput;
    const link = `${PRODUCTION_PROFILE_BASE_URL}/${targetHandle}`;
    navigator.clipboard
      .writeText(link)
      .then(() => {
        setCopyFeedback('Link copied to clipboard!');
        setTimeout(() => {
          setCopyFeedback(null);
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy link:', err);
      });
  }, [PRODUCTION_PROFILE_BASE_URL, handle, handleInput, profileReadyHandle]);

  const goToDashboard = useCallback(() => {
    router.push('/app/dashboard/overview');
    router.refresh();
  }, [router]);

  const goBack = useCallback(() => {
    if (currentStepIndex > 0) {
      goToPreviousStep();
    } else {
      router.back();
    }
  }, [currentStepIndex, goToPreviousStep, router]);

  const renderStepContent = () => {
    switch (currentStepIndex) {
      case 0:
        return (
          <div className='flex flex-col items-center justify-center h-full space-y-8'>
            <div className='text-center space-y-3 max-w-2xl px-4'>
              <h1 className='text-2xl sm:text-3xl font-semibold text-(--fg) transition-colors sm:whitespace-nowrap'>
                {ONBOARDING_STEPS[0].title}
              </h1>
              {ONBOARDING_STEPS[0].prompt && (
                <p className='text-(--muted) text-sm sm:text-base'>
                  {ONBOARDING_STEPS[0].prompt}
                </p>
              )}
            </div>

            <div className='w-full max-w-md space-y-6'>
              <form
                className='space-y-4'
                onSubmit={e => {
                  e.preventDefault();
                  if (
                    isDisplayNameValid &&
                    !isTransitioning &&
                    !state.isSubmitting
                  ) {
                    goToNextStep();
                  }
                }}
              >
                <AuthTextInput
                  id='display-name'
                  ref={nameInputRef}
                  name='name'
                  type='text'
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder={namePlaceholder}
                  aria-label='Your full name'
                  maxLength={50}
                  autoComplete='name'
                />

                <AuthButton
                  type='submit'
                  disabled={
                    !isDisplayNameValid || isTransitioning || state.isSubmitting
                  }
                >
                  Continue
                </AuthButton>
              </form>
            </div>
          </div>
        );

      case 1:
        return (
          <div className='flex flex-col items-center justify-center h-full space-y-8'>
            <div className='text-center space-y-3 max-w-xl px-4'>
              <h1 className='text-2xl sm:text-3xl font-semibold text-(--fg) transition-colors sm:whitespace-nowrap'>
                {ONBOARDING_STEPS[1].title}
              </h1>
              {ONBOARDING_STEPS[1].prompt ? (
                <p className='text-(--muted) text-sm sm:text-base'>
                  {ONBOARDING_STEPS[1].prompt}
                </p>
              ) : null}
            </div>

            <div className='w-full max-w-md space-y-6'>
              <form className='space-y-4' onSubmit={handleSubmit}>
                <label
                  className='text-sm font-medium text-(--muted)'
                  htmlFor='handle-input'
                >
                  @handle
                </label>
                <div className='relative'>
                  <div className='pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6b6f76]'>
                    @
                  </div>
                  <AuthTextInput
                    id='handle-input'
                    ref={handleInputRef}
                    name='username'
                    aria-label='Enter your desired handle'
                    type='text'
                    value={handleInput}
                    onChange={e =>
                      setHandleInput(
                        e.target.value
                          .toLowerCase()
                          .replace(/\s+/g, '')
                          .replace(/^@+/, '')
                      )
                    }
                    placeholder='yourhandle'
                    autoComplete='username'
                    autoCapitalize='none'
                    autoCorrect='off'
                    spellCheck={false}
                    aria-invalid={handleValidation.error ? 'true' : undefined}
                    className={[
                      'pl-10 pr-10',
                      state.error || handleValidation.error
                        ? 'border-red-500'
                        : !state.error && handleValidation.available
                          ? 'border-green-500'
                          : undefined,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  />
                  <div className='absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center'>
                    {handleValidation.checking ? (
                      <LoadingSpinner
                        size='sm'
                        className='text-secondary-token'
                      />
                    ) : state.error || handleValidation.error ? (
                      <svg
                        viewBox='0 0 20 20'
                        fill='none'
                        aria-hidden='true'
                        className='h-5 w-5'
                      >
                        <circle
                          cx='10'
                          cy='10'
                          r='9'
                          stroke='currentColor'
                          className='text-red-500'
                          strokeWidth='2'
                        />
                        <path
                          d='M6.6 6.6l6.8 6.8M13.4 6.6l-6.8 6.8'
                          stroke='currentColor'
                          className='text-red-500'
                          strokeWidth='2'
                          strokeLinecap='round'
                        />
                      </svg>
                    ) : handleInput &&
                      handleValidation.clientValid &&
                      handleValidation.available ? (
                      <svg
                        viewBox='0 0 20 20'
                        fill='none'
                        aria-hidden='true'
                        className='h-5 w-5'
                      >
                        <circle
                          cx='10'
                          cy='10'
                          r='9'
                          stroke='currentColor'
                          className='text-green-600'
                          strokeWidth='2'
                        />
                        <path
                          d='M6 10.2l2.6 2.6L14 7.4'
                          stroke='currentColor'
                          className='text-green-600'
                          strokeWidth='2'
                          strokeLinecap='round'
                          strokeLinejoin='round'
                        />
                      </svg>
                    ) : null}
                  </div>
                </div>

                <div
                  className='min-h-[24px] flex flex-col items-center justify-center px-1'
                  role='status'
                  aria-live='polite'
                >
                  {handleInput && !state.error ? (
                    handleValidation.checking ? (
                      <div className='text-sm text-[#6b6f76] animate-in fade-in slide-in-from-bottom-1 duration-300'>
                        Checking…
                      </div>
                    ) : handleValidation.clientValid &&
                      handleValidation.available ? (
                      <div className='text-green-600 text-sm font-medium animate-in fade-in slide-in-from-bottom-1 duration-300'>
                        Available
                      </div>
                    ) : handleValidation.error ? (
                      <div className='text-red-500 text-sm animate-in fade-in slide-in-from-top-1 duration-300 text-center'>
                        Not available
                      </div>
                    ) : null
                  ) : null}
                </div>

                <AuthButton
                  type='submit'
                  disabled={
                    Boolean(handleStepCtaDisabledReason) || isTransitioning
                  }
                  variant='primary'
                >
                  {state.isSubmitting ? (
                    <div className='flex items-center justify-center space-x-2'>
                      <LoadingSpinner size='sm' className='text-current' />
                      <span>Saving…</span>
                    </div>
                  ) : (
                    'Continue'
                  )}
                </AuthButton>

                <div
                  className='min-h-[40px] flex items-center justify-center text-center text-xs text-[#6b6f76]'
                  role='status'
                  aria-live='polite'
                >
                  {state.error ?? null}
                </div>
              </form>
            </div>
          </div>
        );

      case 2:
        return (
          <div className='flex flex-col items-center justify-center h-full space-y-8'>
            <div className='text-center space-y-3 max-w-xl px-4'>
              <h1 className='text-2xl sm:text-3xl font-semibold text-(--fg) transition-colors sm:whitespace-nowrap'>
                {ONBOARDING_STEPS[2].title}
              </h1>
              {ONBOARDING_STEPS[2].prompt ? (
                <p className='text-(--muted) text-sm sm:text-base'>
                  {ONBOARDING_STEPS[2].prompt}
                </p>
              ) : null}
            </div>

            <div className='w-full max-w-md space-y-6'>
              <AuthLinkPreviewCard
                label='Your link'
                hrefText={`${displayDomain}/${profileReadyHandle || handle}`}
              />

              <div className='space-y-4'>
                <AuthButton onClick={goToDashboard}>Go to Dashboard</AuthButton>

                <AuthButton onClick={copyProfileLink} variant='secondary'>
                  Copy Link
                </AuthButton>
              </div>

              {copyFeedback && (
                <div className='p-3 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/50 rounded-xl text-green-600 dark:text-green-400 text-sm text-center'>
                  {copyFeedback}
                </div>
              )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className='w-full flex flex-col items-center justify-center bg-(--bg) text-(--fg) gap-6'>
      <AuthBackButton onClick={goBack} ariaLabel='Go back' />

      <Link
        href='#main-content'
        className='sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-4 focus-visible:left-4 px-4 py-2 rounded-md z-50 btn btn-primary btn-sm'
      >
        Skip to main content
      </Link>

      <div className='sr-only' aria-live='polite' aria-atomic='true'>
        Step {currentStepIndex + 1} of {ONBOARDING_STEPS.length}:{' '}
        {ONBOARDING_STEPS[currentStepIndex]?.title}
      </div>

      <main
        className='w-full max-w-3xl flex items-center justify-center px-4 pb-8'
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
