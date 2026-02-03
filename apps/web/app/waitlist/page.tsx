'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthBackButton, AuthButton, AuthLayout } from '@/components/auth';
import { APP_ROUTES } from '@/constants/routes';
import {
  ALLOWED_PLANS,
  clearWaitlistStorage,
  type FormErrors,
  isValidUrl,
  normalizeUrl,
  PRIMARY_GOAL_OPTIONS,
  type PrimaryGoal,
  resolvePrimarySocialUrl,
  SOCIAL_PLATFORM_OPTIONS,
  type SocialPlatform,
  WAITLIST_STORAGE_KEYS,
} from '@/components/waitlist/types';
import { WaitlistAdditionalInfoStep } from '@/components/waitlist/WaitlistAdditionalInfoStep';
import { WaitlistPrimaryGoalStep } from '@/components/waitlist/WaitlistPrimaryGoalStep';
import { WaitlistSkeleton } from '@/components/waitlist/WaitlistSkeleton';
import { WaitlistSocialStep } from '@/components/waitlist/WaitlistSocialStep';
import { WaitlistSuccessView } from '@/components/waitlist/WaitlistSuccessView';
import { captureWarning } from '@/lib/error-tracking';
import { FetchError } from '@/lib/queries/fetch';
import { useWaitlistSubmitMutation } from '@/lib/queries/useWaitlistMutations';
import { useWaitlistStatusQuery } from '@/lib/queries/useWaitlistStatusQuery';

type StepNumber = 0 | 1 | 2;

export default function WaitlistPage() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPlan = useMemo(() => {
    const plan = searchParams.get('plan');
    if (!plan) return null;
    return ALLOWED_PLANS.has(plan) ? plan : null;
  }, [searchParams]);

  const [isHydrating, setIsHydrating] = useState(true);
  const [step, setStep] = useState<StepNumber>(0);
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal | null>(null);
  const [primaryGoalFocusIndex, setPrimaryGoalFocusIndex] = useState(0);
  const [socialPlatform, setSocialPlatform] =
    useState<SocialPlatform>('instagram');
  const [primarySocialUrl, setPrimarySocialUrl] = useState('');
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [heardAbout, setHeardAbout] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});

  // TanStack Query mutation for waitlist submission
  const { mutate: submitWaitlist, isPending: isSubmitting } =
    useWaitlistSubmitMutation();

  // TanStack Query for waitlist status (cached, deduplicated)
  const { data: waitlistStatus } = useWaitlistStatusQuery(
    isLoaded && isSignedIn === true
  );

  const primaryGoalButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const socialPlatformButtonRefs = useRef<Array<HTMLInputElement | null>>([]);
  const primarySocialUrlInputRef = useRef<HTMLInputElement | null>(null);
  const spotifyUrlInputRef = useRef<HTMLInputElement | null>(null);

  const selectedPrimaryGoalIndex = useMemo(() => {
    if (!primaryGoal) return 0;
    const index = PRIMARY_GOAL_OPTIONS.findIndex(o => o.value === primaryGoal);
    return Math.max(index, 0);
  }, [primaryGoal]);

  const selectedSocialPlatformIndex = useMemo(() => {
    const index = SOCIAL_PLATFORM_OPTIONS.findIndex(
      o => o.value === socialPlatform
    );
    return Math.max(index, 0);
  }, [socialPlatform]);

  useEffect(() => {
    if (step !== 0) return;
    if (!primaryGoal) return;
    setPrimaryGoalFocusIndex(selectedPrimaryGoalIndex);
  }, [primaryGoal, selectedPrimaryGoalIndex, step]);

  useEffect(() => {
    setIsHydrating(false);
  }, []);

  // Load all persisted form state on mount
  useEffect(() => {
    try {
      const storedSubmitted = globalThis.sessionStorage.getItem(
        WAITLIST_STORAGE_KEYS.submitted
      );
      if (storedSubmitted === 'true') {
        setIsSubmitted(true);
      }

      const storedStep = globalThis.sessionStorage.getItem(
        WAITLIST_STORAGE_KEYS.step
      );
      if (storedStep === '0' || storedStep === '1' || storedStep === '2') {
        setStep(Number.parseInt(storedStep, 10) as StepNumber);
      }

      const storedGoal = globalThis.sessionStorage.getItem(
        WAITLIST_STORAGE_KEYS.primaryGoal
      );
      if (
        storedGoal === 'streams' ||
        storedGoal === 'merch' ||
        storedGoal === 'tickets'
      ) {
        setPrimaryGoal(storedGoal);
      }

      const storedPlatform = globalThis.sessionStorage.getItem(
        WAITLIST_STORAGE_KEYS.socialPlatform
      );
      if (
        storedPlatform === 'instagram' ||
        storedPlatform === 'tiktok' ||
        storedPlatform === 'youtube' ||
        storedPlatform === 'other'
      ) {
        setSocialPlatform(storedPlatform);
      }

      const storedSocialUrl = globalThis.sessionStorage.getItem(
        WAITLIST_STORAGE_KEYS.primarySocialUrl
      );
      if (storedSocialUrl) {
        setPrimarySocialUrl(storedSocialUrl);
      }

      const storedSpotifyUrl = globalThis.sessionStorage.getItem(
        WAITLIST_STORAGE_KEYS.spotifyUrl
      );
      if (storedSpotifyUrl) {
        setSpotifyUrl(storedSpotifyUrl);
      }

      const storedHeardAbout = globalThis.sessionStorage.getItem(
        WAITLIST_STORAGE_KEYS.heardAbout
      );
      if (storedHeardAbout) {
        setHeardAbout(storedHeardAbout);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Persist form state to sessionStorage (consolidated from 6 separate effects)
  useEffect(() => {
    const persist = (key: string, value: string | null) => {
      try {
        if (value) {
          globalThis.sessionStorage.setItem(key, value);
        } else {
          globalThis.sessionStorage.removeItem(key);
        }
      } catch {
        // Ignore storage errors
      }
    };

    persist(WAITLIST_STORAGE_KEYS.step, String(step));
    persist(WAITLIST_STORAGE_KEYS.primaryGoal, primaryGoal);
    persist(WAITLIST_STORAGE_KEYS.socialPlatform, socialPlatform);
    persist(WAITLIST_STORAGE_KEYS.primarySocialUrl, primarySocialUrl || null);
    persist(WAITLIST_STORAGE_KEYS.spotifyUrl, spotifyUrl || null);
    persist(WAITLIST_STORAGE_KEYS.heardAbout, heardAbout || null);
  }, [
    step,
    primaryGoal,
    socialPlatform,
    primarySocialUrl,
    spotifyUrl,
    heardAbout,
  ]);

  // Handle user ID changes and sync storage
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    try {
      const storedUserId = globalThis.sessionStorage.getItem(
        WAITLIST_STORAGE_KEYS.userId
      );
      if (storedUserId && storedUserId !== userId) {
        clearWaitlistStorage();
        setIsSubmitted(false);
      }
      if (userId) {
        globalThis.sessionStorage.setItem(WAITLIST_STORAGE_KEYS.userId, userId);
      }
    } catch {
      // Ignore storage errors
    }
  }, [isLoaded, isSignedIn, userId]);

  // Handle waitlist status from TanStack Query (cached, deduplicated)
  useEffect(() => {
    if (!waitlistStatus) return;

    if (waitlistStatus.hasEntry) {
      if (waitlistStatus.status === 'invited' && waitlistStatus.inviteToken) {
        clearWaitlistStorage();
        router.replace(
          `/claim/${encodeURIComponent(waitlistStatus.inviteToken)}`
        );
        return;
      }

      if (waitlistStatus.status === 'claimed') {
        clearWaitlistStorage();
        router.replace(APP_ROUTES.DASHBOARD);
        return;
      }

      clearWaitlistStorage();
      try {
        globalThis.sessionStorage.setItem(
          WAITLIST_STORAGE_KEYS.submitted,
          'true'
        );
      } catch {
        // Ignore storage errors
      }
      setIsSubmitted(true);
      return;
    }

    clearWaitlistStorage();
    setIsSubmitted(false);
  }, [waitlistStatus, router]);

  const validateStep = useCallback(
    (targetStep: StepNumber): FormErrors => {
      const errors: FormErrors = {};

      if (targetStep === 0) {
        if (!primaryGoal) {
          errors.primaryGoal = ['Primary goal is required'];
        }
      }

      if (targetStep === 1) {
        const resolvedUrl = resolvePrimarySocialUrl(
          primarySocialUrl,
          socialPlatform
        );

        if (!primarySocialUrl.trim()) {
          errors.primarySocialUrl = ['Social profile link is required'];
        } else if (!isValidUrl(resolvedUrl)) {
          errors.primarySocialUrl = ['Please enter a valid URL'];
        }
      }

      if (targetStep === 2) {
        if (spotifyUrl.trim() && !isValidUrl(spotifyUrl)) {
          errors.spotifyUrl = ['Please enter a valid Spotify URL'];
        }
      }

      return errors;
    },
    [primaryGoal, primarySocialUrl, socialPlatform, spotifyUrl]
  );

  const handleNext = () => {
    setError('');
    const errors = validateStep(step);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);

      if (step === 0) {
        const fallback = primaryGoalButtonRefs.current[primaryGoalFocusIndex];
        fallback?.focus();
      }

      if (step === 1) {
        primarySocialUrlInputRef.current?.focus();
      }

      if (step === 2) {
        spotifyUrlInputRef.current?.focus();
      }

      return;
    }

    setFieldErrors({});

    if (step < 2) setStep((step + 1) as StepNumber);
  };

  const handleBack = () => {
    setError('');
    setFieldErrors({});
    if (step > 0) setStep((step - 1) as StepNumber);
  };

  const handlePrimaryGoalSelect = (goal: PrimaryGoal) => {
    if (isSubmitting) return;
    setPrimaryGoal(goal);
    setError('');
    setFieldErrors({});

    const index = PRIMARY_GOAL_OPTIONS.findIndex(o => o.value === goal);
    if (index >= 0) {
      setPrimaryGoalFocusIndex(index);
    }

    setStep(prev => (prev === 0 ? 1 : prev));
  };

  const handlePrimaryGoalKeyDown = (e: React.KeyboardEvent) => {
    if (isSubmitting) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();

    const delta = e.key === 'ArrowDown' ? 1 : -1;
    const nextIndex =
      (primaryGoalFocusIndex + delta + PRIMARY_GOAL_OPTIONS.length) %
      PRIMARY_GOAL_OPTIONS.length;

    setPrimaryGoalFocusIndex(nextIndex);
    primaryGoalButtonRefs.current[nextIndex]?.focus();
  };

  const handleSocialPlatformSelect = (next: SocialPlatform) => {
    if (isSubmitting) return;
    setSocialPlatform(next);
    setPrimarySocialUrl('');
    setFieldErrors({});
    setError('');
  };

  const handleSocialPlatformKeyDown = (e: React.KeyboardEvent) => {
    if (isSubmitting) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();

    const delta = e.key === 'ArrowRight' ? 1 : -1;
    const nextIndex =
      (selectedSocialPlatformIndex + delta + SOCIAL_PLATFORM_OPTIONS.length) %
      SOCIAL_PLATFORM_OPTIONS.length;
    const nextPlatform = SOCIAL_PLATFORM_OPTIONS[nextIndex]?.value;
    if (!nextPlatform) return;

    handleSocialPlatformSelect(nextPlatform);
    socialPlatformButtonRefs.current[nextIndex]?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    const allErrors: FormErrors = {
      ...validateStep(0),
      ...validateStep(1),
      ...validateStep(2),
    };

    if (Object.keys(allErrors).length > 0) {
      setFieldErrors(allErrors);
      return;
    }

    const resolvedPrimarySocialUrl = resolvePrimarySocialUrl(
      primarySocialUrl,
      socialPlatform
    );
    const normalizedSpotifyUrl = spotifyUrl ? normalizeUrl(spotifyUrl) : null;
    const sanitizedHeardAbout = heardAbout.trim() || null;

    submitWaitlist(
      {
        primaryGoal: primaryGoal!,
        primarySocialUrl: resolvedPrimarySocialUrl,
        spotifyUrl: normalizedSpotifyUrl,
        heardAbout: sanitizedHeardAbout,
        selectedPlan,
      },
      {
        onSuccess: () => {
          clearWaitlistStorage();
          try {
            globalThis.sessionStorage.setItem(
              WAITLIST_STORAGE_KEYS.submitted,
              'true'
            );
          } catch {
            // Ignore storage errors
          }
          setIsSubmitted(true);
        },
        onError: err => {
          // Check for field validation errors
          const fetchErr = err as FetchError & {
            errors?: Record<string, string[]>;
          };
          if (fetchErr.errors) {
            setFieldErrors(fetchErr.errors as FormErrors);
          } else {
            void captureWarning('Waitlist signup error', err, {
              primaryGoal,
              socialPlatform,
            });
            setError(
              err instanceof Error
                ? err.message
                : 'Something went wrong. Please try again.'
            );
          }
        },
      }
    );
  };

  if (isSubmitted) {
    return <WaitlistSuccessView />;
  }

  const currentStepErrors = validateStep(step);
  const isCurrentStepValid = Object.keys(currentStepErrors).length === 0;
  const allErrors: FormErrors = {
    ...validateStep(0),
    ...validateStep(1),
    ...validateStep(2),
  };
  const isReadyToSubmit = Object.keys(allErrors).length === 0;

  if (isHydrating) {
    return <WaitlistSkeleton />;
  }

  return (
    <AuthLayout
      formTitle=''
      showFormTitle={false}
      showFooterPrompt={false}
      showLogo={false}
      showLogoutButton
      logoutRedirectUrl='/sign-in'
    >
      <div className='w-full'>
        <form onSubmit={handleSubmit} className='space-y-4'>
          {step === 0 && (
            <WaitlistPrimaryGoalStep
              primaryGoal={primaryGoal}
              primaryGoalFocusIndex={primaryGoalFocusIndex}
              fieldErrors={fieldErrors}
              isSubmitting={isSubmitting}
              isHydrating={isHydrating}
              onSelect={handlePrimaryGoalSelect}
              onKeyDown={handlePrimaryGoalKeyDown}
              setButtonRef={(index, el) => {
                primaryGoalButtonRefs.current[index] = el;
              }}
            />
          )}

          {step === 1 && (
            <WaitlistSocialStep
              socialPlatform={socialPlatform}
              primarySocialUrl={primarySocialUrl}
              fieldErrors={fieldErrors}
              isSubmitting={isSubmitting}
              isHydrating={isHydrating}
              onPlatformSelect={handleSocialPlatformSelect}
              onPlatformKeyDown={handleSocialPlatformKeyDown}
              onUrlChange={setPrimarySocialUrl}
              onNext={handleNext}
              setPlatformButtonRef={(index, el) => {
                socialPlatformButtonRefs.current[index] = el;
              }}
              setUrlInputRef={el => {
                primarySocialUrlInputRef.current = el;
              }}
            />
          )}

          {step === 2 && (
            <WaitlistAdditionalInfoStep
              spotifyUrl={spotifyUrl}
              heardAbout={heardAbout}
              fieldErrors={fieldErrors}
              isSubmitting={isSubmitting}
              isHydrating={isHydrating}
              onSpotifyUrlChange={setSpotifyUrl}
              onHeardAboutChange={setHeardAbout}
              setSpotifyUrlInputRef={el => {
                spotifyUrlInputRef.current = el;
              }}
            />
          )}

          {error && (
            <div role='alert' className='text-red-400 text-sm text-center'>
              {error}
            </div>
          )}

          {step === 2 && (
            <AuthButton
              type='submit'
              disabled={isSubmitting || !isReadyToSubmit}
              variant='primary'
            >
              {isSubmitting ? 'Submitting…' : 'Join the waitlist'}
            </AuthButton>
          )}

          {step === 1 && (
            <AuthButton
              type='button'
              onClick={handleNext}
              disabled={isSubmitting || !isCurrentStepValid}
              variant='primary'
            >
              Continue
            </AuthButton>
          )}

          <div className='flex items-center justify-center pt-2'>
            <AuthBackButton
              onClick={() => {
                if (isSubmitting) return;
                if (step === 0) {
                  router.push('/');
                  return;
                }
                handleBack();
              }}
              className='text-center'
            />
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}
