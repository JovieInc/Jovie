'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { AuthBackButton, AuthButton, AuthLayout } from '@/features/auth';
import {
  ALLOWED_PLANS,
  clearWaitlistStorage,
  type FormErrors,
  isValidUrl,
  normalizeUrl,
  resolvePrimarySocialUrl,
  SOCIAL_PLATFORM_OPTIONS,
  type SocialPlatform,
  WAITLIST_STORAGE_KEYS,
} from '@/features/waitlist/types';
import { WaitlistAdditionalInfoStep } from '@/features/waitlist/WaitlistAdditionalInfoStep';
import { WaitlistSkeleton } from '@/features/waitlist/WaitlistSkeleton';
import { WaitlistSocialStep } from '@/features/waitlist/WaitlistSocialStep';
import { WaitlistSuccessView } from '@/features/waitlist/WaitlistSuccessView';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { captureWarning } from '@/lib/error-tracking';
import {
  FetchError,
  useWaitlistStatusQuery,
  useWaitlistSubmitMutation,
} from '@/lib/queries';

type StepNumber = 0 | 1;

export default function WaitlistPage() {
  const { isLoaded, isSignedIn, userId } = useAuthSafe();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPlan = useMemo(() => {
    const plan = searchParams.get('plan');
    if (!plan) return null;
    return ALLOWED_PLANS.has(plan) ? plan : null;
  }, [searchParams]);

  const [isHydrating, setIsHydrating] = useState(true);
  const [step, setStep] = useState<StepNumber>(0);
  const [socialPlatform, setSocialPlatform] =
    useState<SocialPlatform>('instagram');
  const [primarySocialUrl, setPrimarySocialUrl] = useState('');
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [spotifyArtistName, setSpotifyArtistName] = useState<string | null>(
    null
  );
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

  const socialPlatformButtonRefs = useRef<Array<HTMLInputElement | null>>([]);
  const primarySocialUrlInputRef = useRef<HTMLInputElement | null>(null);
  const spotifyUrlInputRef = useRef<HTMLInputElement | null>(null);

  const selectedSocialPlatformIndex = useMemo(() => {
    const index = SOCIAL_PLATFORM_OPTIONS.findIndex(
      o => o.value === socialPlatform
    );
    return Math.max(index, 0);
  }, [socialPlatform]);

  useEffect(() => {
    setIsHydrating(false);
  }, []);

  // Load all persisted form state on mount
  useEffect(() => {
    try {
      // Evict defunct key from removed primary goal step
      globalThis.sessionStorage.removeItem('waitlist_primary_goal');

      const storedSubmitted = globalThis.sessionStorage.getItem(
        WAITLIST_STORAGE_KEYS.submitted
      );
      if (storedSubmitted === 'true') {
        setIsSubmitted(true);
      }

      const storedStep = globalThis.sessionStorage.getItem(
        WAITLIST_STORAGE_KEYS.step
      );
      if (storedStep === '0' || storedStep === '1') {
        setStep(Number.parseInt(storedStep, 10) as StepNumber);
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

      const storedSpotifyArtistName = globalThis.sessionStorage.getItem(
        WAITLIST_STORAGE_KEYS.spotifyArtistName
      );
      if (storedSpotifyArtistName) {
        setSpotifyArtistName(storedSpotifyArtistName);
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

  // Persist form state to sessionStorage
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
    persist(WAITLIST_STORAGE_KEYS.socialPlatform, socialPlatform);
    persist(WAITLIST_STORAGE_KEYS.primarySocialUrl, primarySocialUrl || null);
    persist(WAITLIST_STORAGE_KEYS.spotifyUrl, spotifyUrl || null);
    persist(WAITLIST_STORAGE_KEYS.spotifyArtistName, spotifyArtistName);
    persist(WAITLIST_STORAGE_KEYS.heardAbout, heardAbout || null);
  }, [
    step,
    socialPlatform,
    primarySocialUrl,
    spotifyUrl,
    spotifyArtistName,
    heardAbout,
  ]);

  // If auth identity changes, clear any saved waitlist draft.
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;

    if (lastUserIdRef.current && lastUserIdRef.current !== userId) {
      clearWaitlistStorage();
      setIsSubmitted(false);
    }

    lastUserIdRef.current = userId;
  }, [isLoaded, isSignedIn, userId]);

  // Handle waitlist status from TanStack Query (cached, deduplicated)
  useEffect(() => {
    if (!waitlistStatus) return;

    if (waitlistStatus.hasEntry) {
      if (
        waitlistStatus.status === 'invited' &&
        waitlistStatus.inviteToken &&
        waitlistStatus.inviteUsername
      ) {
        clearWaitlistStorage();
        router.replace(
          `/${encodeURIComponent(waitlistStatus.inviteUsername)}/claim?token=${encodeURIComponent(waitlistStatus.inviteToken)}`
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

      if (targetStep === 1) {
        if (spotifyUrl.trim() && !isValidUrl(spotifyUrl)) {
          errors.spotifyUrl = ['Please enter a valid Spotify URL'];
        }
      }

      return errors;
    },
    [primarySocialUrl, socialPlatform, spotifyUrl]
  );

  const handleNext = () => {
    setError('');
    const errors = validateStep(step);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);

      if (step === 0) {
        primarySocialUrlInputRef.current?.focus();
      }

      if (step === 1) {
        spotifyUrlInputRef.current?.focus();
      }

      return;
    }

    setFieldErrors({});

    if (step < 1) setStep((step + 1) as StepNumber);
  };

  const handleBack = () => {
    setError('');
    setFieldErrors({});
    if (step > 0) setStep((step - 1) as StepNumber);
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
        primaryGoal: null,
        primarySocialUrl: resolvedPrimarySocialUrl,
        spotifyUrl: normalizedSpotifyUrl,
        spotifyArtistName: spotifyArtistName || null,
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
      logoutRedirectUrl={APP_ROUTES.SIGNIN}
    >
      <div className='w-full'>
        <form onSubmit={handleSubmit} className='space-y-4'>
          {step === 0 && (
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

          {step === 1 && (
            <WaitlistAdditionalInfoStep
              spotifyUrl={spotifyUrl}
              heardAbout={heardAbout}
              fieldErrors={fieldErrors}
              isSubmitting={isSubmitting}
              isHydrating={isHydrating}
              onSpotifyUrlChange={setSpotifyUrl}
              onSpotifyArtistNameChange={setSpotifyArtistName}
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

          {step === 1 && (
            <AuthButton
              type='submit'
              disabled={isSubmitting || !isReadyToSubmit}
              variant='primary'
            >
              {isSubmitting ? 'Submitting…' : 'Join the waitlist'}
            </AuthButton>
          )}

          {step === 0 && (
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
