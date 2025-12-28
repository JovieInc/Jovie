'use client';

import { useAuth, useClerk } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AuthBackButton, AuthLayout } from '@/components/auth';
import { WaitlistAdditionalInfoStep } from '@/components/waitlist/WaitlistAdditionalInfoStep';
import { WaitlistPrimaryGoalStep } from '@/components/waitlist/WaitlistPrimaryGoalStep';
import { WaitlistSkeleton } from '@/components/waitlist/WaitlistSkeleton';
import { WaitlistSocialStep } from '@/components/waitlist/WaitlistSocialStep';
import { WaitlistSuccessView } from '@/components/waitlist/WaitlistSuccessView';
import {
  ALLOWED_PLANS,
  BUTTON_CLASSES,
  PRIMARY_GOAL_OPTIONS,
  SOCIAL_PLATFORM_OPTIONS,
  WAITLIST_STORAGE_KEYS,
  clearWaitlistStorage,
  isValidUrl,
  normalizeUrl,
  resolvePrimarySocialUrl,
  type FormErrors,
  type PrimaryGoal,
  type SocialPlatform,
} from '@/components/waitlist/types';

export default function WaitlistPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPlan = useMemo(() => {
    const plan = searchParams.get('plan');
    if (!plan) return null;
    return ALLOWED_PLANS.has(plan) ? plan : null;
  }, [searchParams]);

  const [isHydrating, setIsHydrating] = useState(true);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal | null>(null);
  const [primaryGoalFocusIndex, setPrimaryGoalFocusIndex] = useState(0);
  const [socialPlatform, setSocialPlatform] =
    useState<SocialPlatform>('instagram');
  const [primarySocialUrl, setPrimarySocialUrl] = useState('');
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [heardAbout, setHeardAbout] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});

  const primaryGoalButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const socialPlatformButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const primarySocialUrlInputRef = useRef<HTMLInputElement | null>(null);
  const spotifyUrlInputRef = useRef<HTMLInputElement | null>(null);

  const selectedPrimaryGoalIndex = useMemo(() => {
    if (!primaryGoal) return 0;
    const index = PRIMARY_GOAL_OPTIONS.findIndex(o => o.value === primaryGoal);
    return index >= 0 ? index : 0;
  }, [primaryGoal]);

  const selectedSocialPlatformIndex = useMemo(() => {
    const index = SOCIAL_PLATFORM_OPTIONS.findIndex(
      o => o.value === socialPlatform
    );
    return index >= 0 ? index : 0;
  }, [socialPlatform]);

  useEffect(() => {
    if (step !== 0) return;
    if (!primaryGoal) return;
    setPrimaryGoalFocusIndex(selectedPrimaryGoalIndex);
  }, [primaryGoal, selectedPrimaryGoalIndex, step]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace('/signin?redirect_url=/waitlist');
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    setIsHydrating(false);
  }, []);

  // Load all persisted form state on mount
  useEffect(() => {
    try {
      const storedStep = window.sessionStorage.getItem(
        WAITLIST_STORAGE_KEYS.step
      );
      if (storedStep === '0' || storedStep === '1' || storedStep === '2') {
        setStep(Number.parseInt(storedStep, 10) as 0 | 1 | 2);
      }

      const storedGoal = window.sessionStorage.getItem(
        WAITLIST_STORAGE_KEYS.primaryGoal
      );
      if (
        storedGoal === 'streams' ||
        storedGoal === 'merch' ||
        storedGoal === 'tickets'
      ) {
        setPrimaryGoal(storedGoal);
      }

      const storedPlatform = window.sessionStorage.getItem(
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

      const storedSocialUrl = window.sessionStorage.getItem(
        WAITLIST_STORAGE_KEYS.primarySocialUrl
      );
      if (storedSocialUrl) {
        setPrimarySocialUrl(storedSocialUrl);
      }

      const storedSpotifyUrl = window.sessionStorage.getItem(
        WAITLIST_STORAGE_KEYS.spotifyUrl
      );
      if (storedSpotifyUrl) {
        setSpotifyUrl(storedSpotifyUrl);
      }

      const storedHeardAbout = window.sessionStorage.getItem(
        WAITLIST_STORAGE_KEYS.heardAbout
      );
      if (storedHeardAbout) {
        setHeardAbout(storedHeardAbout);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Persist step changes
  useEffect(() => {
    try {
      window.sessionStorage.setItem(WAITLIST_STORAGE_KEYS.step, String(step));
    } catch {
      // Ignore storage errors
    }
  }, [step]);

  // Persist primary goal changes
  useEffect(() => {
    try {
      if (primaryGoal) {
        window.sessionStorage.setItem(
          WAITLIST_STORAGE_KEYS.primaryGoal,
          primaryGoal
        );
      } else {
        window.sessionStorage.removeItem(WAITLIST_STORAGE_KEYS.primaryGoal);
      }
    } catch {
      // Ignore storage errors
    }
  }, [primaryGoal]);

  // Persist social platform changes
  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        WAITLIST_STORAGE_KEYS.socialPlatform,
        socialPlatform
      );
    } catch {
      // Ignore storage errors
    }
  }, [socialPlatform]);

  // Persist primary social URL changes
  useEffect(() => {
    try {
      if (primarySocialUrl) {
        window.sessionStorage.setItem(
          WAITLIST_STORAGE_KEYS.primarySocialUrl,
          primarySocialUrl
        );
      } else {
        window.sessionStorage.removeItem(
          WAITLIST_STORAGE_KEYS.primarySocialUrl
        );
      }
    } catch {
      // Ignore storage errors
    }
  }, [primarySocialUrl]);

  // Persist spotify URL changes
  useEffect(() => {
    try {
      if (spotifyUrl) {
        window.sessionStorage.setItem(
          WAITLIST_STORAGE_KEYS.spotifyUrl,
          spotifyUrl
        );
      } else {
        window.sessionStorage.removeItem(WAITLIST_STORAGE_KEYS.spotifyUrl);
      }
    } catch {
      // Ignore storage errors
    }
  }, [spotifyUrl]);

  // Persist heard about changes
  useEffect(() => {
    try {
      if (heardAbout) {
        window.sessionStorage.setItem(
          WAITLIST_STORAGE_KEYS.heardAbout,
          heardAbout
        );
      } else {
        window.sessionStorage.removeItem(WAITLIST_STORAGE_KEYS.heardAbout);
      }
    } catch {
      // Ignore storage errors
    }
  }, [heardAbout]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void (async () => {
      try {
        const response = await fetch('/api/waitlist', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = (await response.json().catch(() => null)) as {
          hasEntry: boolean;
          status: string | null;
          inviteToken: string | null;
        } | null;

        if (!response.ok || !data) return;

        if (data.hasEntry) {
          if (data.status === 'invited' && data.inviteToken) {
            clearWaitlistStorage();
            router.replace(`/claim/${encodeURIComponent(data.inviteToken)}`);
            return;
          }

          if (data.status === 'claimed') {
            clearWaitlistStorage();
            router.replace('/app/dashboard');
            return;
          }
          clearWaitlistStorage();
          setIsSubmitted(true);
        }
      } catch {
        // Ignore fetch errors; page can still be used.
      }
    })();
  }, [isLoaded, isSignedIn, router]);

  const validateStep = (targetStep: 0 | 1 | 2): FormErrors => {
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
  };

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

    if (step === 0) setStep(1);
    if (step === 1) setStep(2);
  };

  const handleBack = () => {
    setError('');
    setFieldErrors({});
    if (step === 2) setStep(1);
    if (step === 1) setStep(0);
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

  const handleSubmit = async (e: React.FormEvent) => {
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

    setIsSubmitting(true);

    try {
      const resolvedPrimarySocialUrl = resolvePrimarySocialUrl(
        primarySocialUrl,
        socialPlatform
      );
      const normalizedSpotifyUrl = spotifyUrl ? normalizeUrl(spotifyUrl) : null;
      const sanitizedHeardAbout = heardAbout.trim() || null;

      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryGoal,
          primarySocialUrl: resolvedPrimarySocialUrl,
          spotifyUrl: normalizedSpotifyUrl,
          heardAbout: sanitizedHeardAbout,
          selectedPlan,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.errors) {
          setFieldErrors(result.errors as FormErrors);
        } else {
          setError(result.error || 'Something went wrong. Please try again.');
        }
        return;
      }

      clearWaitlistStorage();
      setIsSubmitted(true);
    } catch (err) {
      console.error('Waitlist signup error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    if (isSubmitting || isSigningOut) return;
    setIsSigningOut(true);

    try {
      await signOut(() => router.push('/'));
    } catch (err) {
      console.error('Waitlist sign out error:', err);
      setIsSigningOut(false);
    }
  };

  if (isSubmitted) {
    return (
      <WaitlistSuccessView
        isSigningOut={isSigningOut}
        onSignOut={handleSignOut}
      />
    );
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
            <button
              type='submit'
              disabled={isSubmitting || !isReadyToSubmit}
              className={BUTTON_CLASSES}
            >
              {isSubmitting ? 'Submitting…' : 'Join the waitlist'}
            </button>
          )}

          {step === 1 && (
            <button
              type='button'
              onClick={handleNext}
              disabled={isSubmitting || !isCurrentStepValid}
              className={BUTTON_CLASSES}
            >
              Continue
            </button>
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

          <div className='flex items-center justify-center'>
            <button
              type='button'
              onClick={handleSignOut}
              disabled={isSubmitting || isSigningOut}
              className='text-sm text-red-400 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
            >
              {isSigningOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}
