'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthBackButton, AuthLayout } from '@/components/auth';
import { WaitlistSkeleton } from '@/components/waitlist/WaitlistSkeleton';

interface FormErrors {
  fullName?: string[];
  email?: string[];
  primaryGoal?: string[];
  primarySocialUrl?: string[];
  spotifyUrl?: string[];
  heardAbout?: string[];
}

type PrimaryGoal = 'streams' | 'merch' | 'tickets';

type SocialPlatform = 'instagram' | 'tiktok' | 'youtube' | 'other';

const INPUT_CLASSES =
  'w-full px-4 py-3 border-0 rounded-lg bg-[#23252a] text-white placeholder:text-[#6b6f76] focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-colors';
const BUTTON_CLASSES =
  'w-full rounded-lg bg-[#e8e8e8] hover:bg-white text-[#101012] font-medium py-3 px-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const SOCIAL_PLATFORM_OPTIONS: Array<{ value: SocialPlatform; label: string }> =
  [
    { value: 'instagram', label: 'Instagram' },
    { value: 'tiktok', label: 'TikTok' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'other', label: 'Other' },
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

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPlan = searchParams.get('plan') || null; // free|pro|growth|branding - quietly tracked

  const [isHydrating, setIsHydrating] = useState(true);
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal | null>(null);
  const [socialPlatform, setSocialPlatform] =
    useState<SocialPlatform>('instagram');
  const [primarySocialUrl, setPrimarySocialUrl] = useState('');
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [heardAbout, setHeardAbout] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});

  useEffect(() => {
    setIsHydrating(false);
  }, []);

  const validateStep = (targetStep: 0 | 1 | 2 | 3 | 4): FormErrors => {
    const errors: FormErrors = {};

    if (targetStep === 0) {
      if (!fullName.trim()) {
        errors.fullName = ['Full name is required'];
      }
    }

    if (targetStep === 1) {
      if (!email.trim()) {
        errors.email = ['Email is required'];
      } else if (!isValidEmail(email)) {
        errors.email = ['Please enter a valid email address'];
      }
    }

    if (targetStep === 2) {
      if (!primaryGoal) {
        // Keep messaging minimal; just block progression
        errors.primaryGoal = ['Primary goal is required'];
      }
    }

    if (targetStep === 3) {
      const { buildUrl } = getSocialPlatformPrefix(socialPlatform);
      const resolvedUrl = buildUrl(primarySocialUrl.trim());

      if (!primarySocialUrl.trim()) {
        errors.primarySocialUrl = ['Social profile link is required'];
      } else if (!isValidUrl(resolvedUrl)) {
        errors.primarySocialUrl = ['Please enter a valid URL'];
      }
    }

    if (targetStep === 4) {
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
      return;
    }

    setFieldErrors({});

    if (step === 0) setStep(1);
    if (step === 1) setStep(2);
    if (step === 3) setStep(4);
  };

  const handleBack = () => {
    setError('');
    setFieldErrors({});
    if (step === 4) setStep(3);
    if (step === 3) setStep(2);
    if (step === 2) setStep(1);
    if (step === 1) setStep(0);
  };

  const handlePrimaryGoalSelect = (goal: PrimaryGoal) => {
    if (isSubmitting) return;
    setPrimaryGoal(goal);
    setError('');
    setFieldErrors({});
    setStep(3);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    const allErrors: FormErrors = {
      ...validateStep(0),
      ...validateStep(1),
      ...validateStep(2),
      ...validateStep(3),
      ...validateStep(4),
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
          fullName,
          email,
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
      </AuthLayout>
    );
  }

  const isFormValid =
    fullName.trim() &&
    email.trim() &&
    Boolean(primaryGoal) &&
    primarySocialUrl.trim();

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
              <h1 className='text-lg font-medium text-[rgb(227,228,230)] text-center'>
                What&apos;s your name?
              </h1>
              <input
                type='text'
                id='fullName'
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                className={INPUT_CLASSES}
                placeholder='Full Name'
                disabled={isSubmitting}
              />
              {fieldErrors.fullName && (
                <p className='text-sm text-red-400'>
                  {fieldErrors.fullName[0]}
                </p>
              )}
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h1 className='text-lg font-medium text-[rgb(227,228,230)] text-center'>
                What&apos;s your email?
              </h1>
              <input
                type='email'
                id='email'
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className={INPUT_CLASSES}
                placeholder='Enter your email address'
                disabled={isSubmitting}
              />
              {fieldErrors.email && (
                <p className='text-sm text-red-400'>{fieldErrors.email[0]}</p>
              )}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className='space-y-1'>
                <h1 className='text-lg font-medium text-[rgb(227,228,230)] text-center'>
                  Primary goal
                </h1>
                <p className='text-sm text-[#6b6f76] text-center'>
                  You can change this later.
                </p>
              </div>

              <div
                className='grid grid-cols-1 gap-2'
                role='radiogroup'
                aria-label='Primary goal'
              >
                <button
                  type='button'
                  onClick={() => handlePrimaryGoalSelect('streams')}
                  aria-pressed={primaryGoal === 'streams'}
                  className={`w-full rounded-md px-4 py-3 text-sm font-medium transition-colors border ${
                    primaryGoal === 'streams'
                      ? 'bg-[#e8e8e8] text-[#101012] border-transparent'
                      : 'bg-[#23252a] text-white border-[#2a2d33] hover:bg-[#2a2d33]'
                  }`}
                  disabled={isSubmitting}
                >
                  More streams
                </button>

                <button
                  type='button'
                  onClick={() => handlePrimaryGoalSelect('merch')}
                  aria-pressed={primaryGoal === 'merch'}
                  className={`w-full rounded-md px-4 py-3 text-sm font-medium transition-colors border ${
                    primaryGoal === 'merch'
                      ? 'bg-[#e8e8e8] text-[#101012] border-transparent'
                      : 'bg-[#23252a] text-white border-[#2a2d33] hover:bg-[#2a2d33]'
                  }`}
                  disabled={isSubmitting}
                >
                  Sell more merch
                </button>

                <button
                  type='button'
                  onClick={() => handlePrimaryGoalSelect('tickets')}
                  aria-pressed={primaryGoal === 'tickets'}
                  className={`w-full rounded-md px-4 py-3 text-sm font-medium transition-colors border ${
                    primaryGoal === 'tickets'
                      ? 'bg-[#e8e8e8] text-[#101012] border-transparent'
                      : 'bg-[#23252a] text-white border-[#2a2d33] hover:bg-[#2a2d33]'
                  }`}
                  disabled={isSubmitting}
                >
                  Sell more tickets for shows
                </button>
              </div>
            </>
          ) : null}

          {step === 3 ? (
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
              >
                {SOCIAL_PLATFORM_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type='button'
                    onClick={() => {
                      setSocialPlatform(option.value);
                      setPrimarySocialUrl('');
                      setFieldErrors({});
                      setError('');
                    }}
                    aria-pressed={socialPlatform === option.value}
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
                <input
                  type='text'
                  id='primarySocialUrl'
                  value={primarySocialUrl}
                  onChange={e => setPrimarySocialUrl(e.target.value)}
                  required
                  className={INPUT_CLASSES}
                  placeholder='Paste a link'
                  disabled={isSubmitting}
                />
              ) : (
                <div className='w-full flex items-center gap-2 rounded-lg bg-[#23252a] px-4 py-3'>
                  <span className='text-sm text-[#c9cbd1] whitespace-nowrap'>
                    {getSocialPlatformPrefix(socialPlatform).display}
                  </span>
                  <input
                    type='text'
                    id='primarySocialUrl'
                    value={primarySocialUrl}
                    onChange={e => setPrimarySocialUrl(e.target.value)}
                    required
                    className='min-w-0 flex-1 bg-transparent text-white placeholder:text-[#6b6f76] focus:outline-none'
                    placeholder='yourusername'
                    disabled={isSubmitting}
                  />
                </div>
              )}

              {fieldErrors.primarySocialUrl && (
                <p className='text-sm text-red-400'>
                  {fieldErrors.primarySocialUrl[0]}
                </p>
              )}
            </>
          ) : null}

          {step === 4 ? (
            <>
              <input
                type='text'
                id='spotifyUrl'
                value={spotifyUrl}
                onChange={e => setSpotifyUrl(e.target.value)}
                className={INPUT_CLASSES}
                placeholder='open.spotify.com/artist/... (optional)'
                disabled={isSubmitting}
              />
              {fieldErrors.spotifyUrl && (
                <p className='text-sm text-red-400'>
                  {fieldErrors.spotifyUrl[0]}
                </p>
              )}

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
            <div className='text-red-400 text-sm text-center'>{error}</div>
          )}

          {step === 4 ? (
            <button
              type='submit'
              disabled={isSubmitting || !isFormValid}
              className={BUTTON_CLASSES}
            >
              {isSubmitting ? 'Submitting…' : 'Join the waitlist'}
            </button>
          ) : null}

          {step !== 2 && step < 4 ? (
            <button
              type='button'
              onClick={handleNext}
              disabled={isSubmitting}
              className={BUTTON_CLASSES}
            >
              Continue
            </button>
          ) : null}

          <div className='flex items-center justify-between pt-2'>
            <AuthBackButton
              onClick={() => {
                if (step === 0) {
                  router.back();
                  return;
                }
                handleBack();
              }}
              disabled={isSubmitting}
              className='text-left'
            />

            <div
              className='flex items-center justify-center gap-2'
              role='progressbar'
              aria-label='Progress'
              aria-valuemin={1}
              aria-valuemax={5}
              aria-valuenow={step + 1}
            >
              {Array.from({ length: 5 }).map((_, index) => {
                const isActive = index === step;
                return (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: Static 5-step indicator
                    key={index}
                    className={
                      isActive
                        ? 'h-1.5 w-1.5 rounded-full bg-[#c9cbd1] opacity-100'
                        : 'h-1.5 w-1.5 rounded-full bg-[#c9cbd1] opacity-30'
                    }
                  />
                );
              })}
            </div>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}
