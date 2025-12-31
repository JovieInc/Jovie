'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { completeOnboarding } from '@/app/onboarding/actions';
import { AuthBackButton } from '@/components/auth';
import {
  OnboardingCompleteStep,
  OnboardingHandleStep,
  OnboardingNameStep,
} from '@/components/dashboard/organisms/onboarding';
import { PROFILE_HOSTNAME, PROFILE_URL } from '@/constants/domains';
import { useClipboard } from '@/hooks/useClipboard';
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
  const { copy, isSuccess: copied } = useClipboard({ resetDelay: 2000 });
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
    void copy(link);
  }, [
    PRODUCTION_PROFILE_BASE_URL,
    copy,
    handle,
    handleInput,
    profileReadyHandle,
  ]);

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
          <OnboardingNameStep
            title={ONBOARDING_STEPS[0].title}
            prompt={ONBOARDING_STEPS[0].prompt}
            fullName={fullName}
            namePlaceholder={namePlaceholder}
            isValid={isDisplayNameValid}
            isTransitioning={isTransitioning}
            isSubmitting={state.isSubmitting}
            inputRef={nameInputRef}
            onNameChange={setFullName}
            onSubmit={goToNextStep}
          />
        );

      case 1:
        return (
          <OnboardingHandleStep
            title={ONBOARDING_STEPS[1].title}
            prompt={ONBOARDING_STEPS[1].prompt}
            handleInput={handleInput}
            handleValidation={handleValidation}
            stateError={state.error}
            isSubmitting={state.isSubmitting}
            isTransitioning={isTransitioning}
            ctaDisabledReason={handleStepCtaDisabledReason}
            inputRef={handleInputRef}
            onHandleChange={setHandleInput}
            onSubmit={handleSubmit}
          />
        );

      case 2:
        return (
          <OnboardingCompleteStep
            title={ONBOARDING_STEPS[2].title}
            prompt={ONBOARDING_STEPS[2].prompt}
            displayDomain={displayDomain}
            handle={profileReadyHandle || handle}
            copied={copied}
            onGoToDashboard={goToDashboard}
            onCopyLink={copyProfileLink}
          />
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
