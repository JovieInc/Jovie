'use client';

import { useAuth, useClerk } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AuthBackButton, AuthLayout } from '@/components/auth';
import { WaitlistSkeleton } from '@/components/waitlist/WaitlistSkeleton';

interface FormErrors {
  primaryGoal?: string[];
  primarySocialUrl?: string[];
  spotifyUrl?: string[];
  heardAbout?: string[];
}

type PrimaryGoal = 'streams' | 'merch' | 'tickets';

type SocialPlatform = 'instagram' | 'tiktok' | 'youtube' | 'other';

const INPUT_CLASSES =
  'w-full px-4 py-3 border-0 rounded-md bg-[#23252a] text-white placeholder:text-[#6b6f76] focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-colors';
const BUTTON_CLASSES =
  'w-full rounded-md bg-[#e8e8e8] hover:bg-white text-[#101012] font-medium py-3 px-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const SOCIAL_PLATFORM_OPTIONS: Array<{ value: SocialPlatform; label: string }> =
  [
    { value: 'instagram', label: 'Instagram' },
    { value: 'tiktok', label: 'TikTok' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'other', label: 'Other' },
  ];

const PRIMARY_GOAL_OPTIONS: Array<{ value: PrimaryGoal; label: string }> = [
  { value: 'streams', label: 'More streams' },
  { value: 'merch', label: 'More merch sales' },
  { value: 'tickets', label: 'More ticket sales' },
];

function getSocialPlatformPrefix(platform: SocialPlatform): {
  display: string;
  buildUrl: (value: string) => string;
} {
  if (platform === 'instagram') {
    return {
      display: 'instagram.com/',
      buildUrl: value => `https://instagram.com/${value}`,
    };
  }

  if (platform === 'tiktok') {
    return {
      display: 'tiktok.com/@',
      buildUrl: value => `https://tiktok.com/@${value}`,
    };
  }

  if (platform === 'youtube') {
    return {
      display: 'youtube.com/@',
      buildUrl: value => `https://youtube.com/@${value}`,
    };
  }

  return {
    display: '',
    buildUrl: value => value,
  };
}

function normalizeUrl(url: string): string {
  if (!url.trim()) return '';
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function isValidUrl(url: string): boolean {
  if (!url.trim()) return false;
  const normalized = normalizeUrl(url);
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export default function WaitlistPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPlan = searchParams.get('plan') || null; // free|pro|growth|branding - quietly tracked

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

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem('waitlist_primary_goal');
      if (stored === 'streams' || stored === 'merch' || stored === 'tickets') {
        setPrimaryGoal(stored);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      if (primaryGoal) {
        window.sessionStorage.setItem('waitlist_primary_goal', primaryGoal);
      } else {
        window.sessionStorage.removeItem('waitlist_primary_goal');
      }
    } catch {
      // Ignore storage errors
    }
  }, [primaryGoal]);

  useEffect(() => {
    if (isHydrating) return;

    if (step === 0) {
      const button =
        primaryGoalButtonRefs.current[selectedPrimaryGoalIndex] ??
        primaryGoalButtonRefs.current[0];
      button?.focus();
    }

    if (step === 1) {
      const button =
        socialPlatformButtonRefs.current[selectedSocialPlatformIndex] ??
        socialPlatformButtonRefs.current[0];
      button?.focus();
    }

    if (step === 2) {
      spotifyUrlInputRef.current?.focus();
    }
  }, [
    isHydrating,
    selectedPrimaryGoalIndex,
    selectedSocialPlatformIndex,
    step,
    socialPlatform,
  ]);

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
        } | null;

        if (!response.ok || !data) return;

        if (data.hasEntry) {
          if (data.status === 'invited' || data.status === 'claimed') {
            router.replace('/app/dashboard');
            return;
          }
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
        // Keep messaging minimal; just block progression
        errors.primaryGoal = ['Primary goal is required'];
      }
    }

    if (targetStep === 1) {
      const { buildUrl } = getSocialPlatformPrefix(socialPlatform);
      const resolvedUrl = buildUrl(primarySocialUrl.trim());

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
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryGoal,
          primarySocialUrl: normalizeUrl(
            getSocialPlatformPrefix(socialPlatform).buildUrl(primarySocialUrl)
          ),
          spotifyUrl: spotifyUrl ? normalizeUrl(spotifyUrl) : null,
          heardAbout: heardAbout || null,
          selectedPlan, // Quietly track pricing tier interest
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
      <AuthLayout
        formTitle="You're on the waitlist!"
        showLogo={false}
        showFooterPrompt={false}
        formTitleClassName='text-lg font-medium text-[rgb(227,228,230)] mb-4 text-center'
      >
        <p className='text-sm text-[#6b6f76] text-center'>
          Early access is rolling out in stages.
        </p>

        <div className='flex items-center justify-center pt-6'>
          <button
            type='button'
            onClick={handleSignOut}
            disabled={isSigningOut}
            className='text-sm text-[#6b6f76] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
          >
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </AuthLayout>
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
      {/* Form */}
      <div className='w-full'>
        <form onSubmit={handleSubmit} className='space-y-4'>
          {step === 0 ? (
            <>
              <div className='space-y-1'>
                <h1 className='text-lg font-medium text-[rgb(227,228,230)] text-center'>
                  Primary goal
                </h1>
                <p
                  id='waitlist-primary-goal-hint'
                  className='text-sm text-[#6b6f76] text-center'
                >
                  You can change this later.
                </p>
              </div>

              <div
                className='grid grid-cols-1 gap-2'
                role='radiogroup'
                aria-label='Primary goal'
                aria-describedby={
                  fieldErrors.primaryGoal
                    ? 'waitlist-primary-goal-hint waitlist-primary-goal-error'
                    : 'waitlist-primary-goal-hint'
                }
                onKeyDown={handlePrimaryGoalKeyDown}
              >
                {PRIMARY_GOAL_OPTIONS.map((option, index) => {
                  const isSelected = primaryGoal === option.value;
                  const isTabStop = primaryGoal ? isSelected : index === 0;

                  return (
                    <button
                      // biome-ignore lint/suspicious/noArrayIndexKey: Static options list
                      key={index}
                      ref={el => {
                        primaryGoalButtonRefs.current[index] = el;
                      }}
                      type='button'
                      role='radio'
                      aria-checked={isSelected}
                      tabIndex={isTabStop ? 0 : -1}
                      onClick={() => handlePrimaryGoalSelect(option.value)}
                      className={`w-full rounded-md px-4 py-3 text-sm font-medium transition-colors border ${
                        isSelected
                          ? 'bg-[#e8e8e8] text-[#101012] border-transparent'
                          : 'bg-[#23252a] text-white border-[#2a2d33] hover:bg-[#2a2d33]'
                      }`}
                      disabled={isSubmitting}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {fieldErrors.primaryGoal && (
                <p
                  id='waitlist-primary-goal-error'
                  role='alert'
                  className='text-sm text-red-400'
                >
                  {fieldErrors.primaryGoal[0]}
                </p>
              )}
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className='space-y-1'>
                <h1 className='text-lg font-medium text-[rgb(227,228,230)] text-center'>
                  Where do fans find you?
                </h1>
              </div>

              <div
                className='flex items-center justify-center gap-2'
                role='radiogroup'
                aria-label='Social platform'
                onKeyDown={handleSocialPlatformKeyDown}
              >
                {SOCIAL_PLATFORM_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    ref={el => {
                      const index = SOCIAL_PLATFORM_OPTIONS.findIndex(
                        item => item.value === option.value
                      );
                      if (index >= 0) {
                        socialPlatformButtonRefs.current[index] = el;
                      }
                    }}
                    type='button'
                    role='radio'
                    aria-checked={socialPlatform === option.value}
                    tabIndex={socialPlatform === option.value ? 0 : -1}
                    onClick={() => {
                      handleSocialPlatformSelect(option.value);
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors border ${
                      socialPlatform === option.value
                        ? 'bg-[#23252a] text-white border-transparent'
                        : 'bg-transparent text-[#c9cbd1] border-[#2a2d33] hover:bg-[#23252a]'
                    }`}
                    disabled={isSubmitting}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {socialPlatform === 'other' ? (
                <>
                  <label htmlFor='primarySocialUrl' className='sr-only'>
                    Social profile link
                  </label>
                  <input
                    ref={primarySocialUrlInputRef}
                    type='text'
                    id='primarySocialUrl'
                    value={primarySocialUrl}
                    onChange={e => setPrimarySocialUrl(e.target.value)}
                    required
                    aria-invalid={Boolean(fieldErrors.primarySocialUrl)}
                    aria-describedby={
                      fieldErrors.primarySocialUrl
                        ? 'waitlist-primary-social-url-error'
                        : undefined
                    }
                    className={INPUT_CLASSES}
                    placeholder='Paste a link'
                    disabled={isSubmitting}
                    onKeyDown={e => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      handleNext();
                    }}
                  />
                </>
              ) : (
                <div className='w-full flex items-center gap-2 rounded-md bg-[#23252a] px-4 py-3'>
                  <span className='text-sm text-[#c9cbd1] whitespace-nowrap'>
                    {getSocialPlatformPrefix(socialPlatform).display}
                  </span>
                  <input
                    ref={primarySocialUrlInputRef}
                    type='text'
                    id='primarySocialUrl'
                    value={primarySocialUrl}
                    onChange={e => setPrimarySocialUrl(e.target.value)}
                    required
                    aria-label='Social profile username'
                    aria-invalid={Boolean(fieldErrors.primarySocialUrl)}
                    aria-describedby={
                      fieldErrors.primarySocialUrl
                        ? 'waitlist-primary-social-url-error'
                        : undefined
                    }
                    className='min-w-0 flex-1 bg-transparent text-white placeholder:text-[#6b6f76] focus:outline-none'
                    placeholder='yourusername'
                    disabled={isSubmitting}
                    onKeyDown={e => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      handleNext();
                    }}
                  />
                </div>
              )}

              {fieldErrors.primarySocialUrl && (
                <p
                  id='waitlist-primary-social-url-error'
                  role='alert'
                  className='text-sm text-red-400'
                >
                  {fieldErrors.primarySocialUrl[0]}
                </p>
              )}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <label htmlFor='spotifyUrl' className='sr-only'>
                Spotify link
              </label>
              <input
                type='text'
                id='spotifyUrl'
                value={spotifyUrl}
                onChange={e => setSpotifyUrl(e.target.value)}
                ref={spotifyUrlInputRef}
                aria-invalid={Boolean(fieldErrors.spotifyUrl)}
                aria-describedby={
                  fieldErrors.spotifyUrl
                    ? 'waitlist-spotify-url-error'
                    : undefined
                }
                className={INPUT_CLASSES}
                placeholder='open.spotify.com/artist/... (optional)'
                disabled={isSubmitting}
              />
              {fieldErrors.spotifyUrl && (
                <p
                  id='waitlist-spotify-url-error'
                  role='alert'
                  className='text-sm text-red-400'
                >
                  {fieldErrors.spotifyUrl[0]}
                </p>
              )}

              <label htmlFor='heardAbout' className='sr-only'>
                How did you hear about us?
              </label>
              <input
                type='text'
                id='heardAbout'
                value={heardAbout}
                onChange={e => setHeardAbout(e.target.value)}
                className={INPUT_CLASSES}
                placeholder='How did you hear about us? (optional)'
                disabled={isSubmitting}
              />
            </>
          ) : null}

          {error && (
            <div role='alert' className='text-red-400 text-sm text-center'>
              {error}
            </div>
          )}

          {step === 2 ? (
            <button
              type='submit'
              disabled={isSubmitting || !isReadyToSubmit}
              className={BUTTON_CLASSES}
            >
              {isSubmitting ? 'Submitting…' : 'Join the waitlist'}
            </button>
          ) : null}

          {step === 1 ? (
            <button
              type='button'
              onClick={handleNext}
              disabled={isSubmitting || !isCurrentStepValid}
              className={BUTTON_CLASSES}
            >
              Continue
            </button>
          ) : null}

          <div className='flex items-center justify-center pt-2'>
            <AuthBackButton
              onClick={() => {
                if (step === 0) {
                  router.push('/');
                  return;
                }
                handleBack();
              }}
              disabled={isSubmitting}
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
