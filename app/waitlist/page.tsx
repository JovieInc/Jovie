'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogoIcon } from '@/components/atoms/LogoIcon';
import { Combobox } from '@/components/organisms/Combobox';
import { WaitlistSkeleton } from '@/components/waitlist/WaitlistSkeleton';
import {
  type SpotifyArtistResult,
  useArtistSearch,
} from '@/lib/hooks/useArtistSearch';

interface FormErrors {
  fullName?: string[];
  email?: string[];
  primarySocialUrl?: string[];
  spotifyUrl?: string[];
}

const INPUT_CLASSES =
  'w-full px-4 py-3 border-0 rounded-lg bg-[#23252a] text-white placeholder:text-[#6b6f76] focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-colors';
const BUTTON_CLASSES =
  'w-full rounded-lg bg-[#e8e8e8] hover:bg-white text-[#101012] font-medium py-3 px-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

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
  const searchParams = useSearchParams();
  const selectedPlan = searchParams.get('plan') || null; // free|pro|growth|branding - quietly tracked

  const [isHydrating, setIsHydrating] = useState(true);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [primarySocialUrl, setPrimarySocialUrl] = useState('');
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [spotifyQuery, setSpotifyQuery] = useState('');
  const [selectedSpotify, setSelectedSpotify] =
    useState<SpotifyArtistResult | null>(null);
  const [showSpotifyLinkEntry, setShowSpotifyLinkEntry] = useState(false);
  const [heardAbout, setHeardAbout] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});

  const {
    results: spotifyResults,
    state: spotifySearchState,
    error: spotifySearchError,
    search: searchSpotify,
    clear: clearSpotifySearch,
  } = useArtistSearch({ debounceMs: 250, limit: 6 });

  useEffect(() => {
    setIsHydrating(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    // Client-side validation
    const errors: FormErrors = {};

    if (!fullName.trim()) {
      errors.fullName = ['Full name is required'];
    }

    if (!email.trim()) {
      errors.email = ['Email is required'];
    } else if (!isValidEmail(email)) {
      errors.email = ['Please enter a valid email address'];
    }

    if (!primarySocialUrl.trim()) {
      errors.primarySocialUrl = ['Social profile link is required'];
    } else if (!isValidUrl(primarySocialUrl)) {
      errors.primarySocialUrl = ['Please enter a valid URL'];
    }

    if (spotifyUrl.trim() && !isValidUrl(spotifyUrl)) {
      errors.spotifyUrl = ['Please enter a valid Spotify URL'];
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
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
          primarySocialUrl: normalizeUrl(primarySocialUrl),
          spotifyUrl: spotifyUrl ? normalizeUrl(spotifyUrl) : null,
          heardAbout: heardAbout || null,
          selectedPlan, // Quietly track which pricing tier user clicked
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
      <div className='min-h-screen flex flex-col items-center justify-center bg-[#101012] px-4'>
        {/* Animated logo to checkmark */}
        <div className='mb-8 relative'>
          {/* Logo fades out */}
          <div className='animate-[fadeOut_0.3s_ease-out_forwards]'>
            <LogoIcon size={56} variant='white' />
          </div>
          {/* Checkmark fades in */}
          <div className='absolute inset-0 flex items-center justify-center animate-[fadeIn_0.3s_ease-out_0.2s_forwards] opacity-0'>
            <svg
              className='h-14 w-14 text-white'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
              aria-hidden='true'
            >
              <path
                className='animate-[drawCheck_0.4s_ease-out_0.4s_forwards]'
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                strokeDasharray={24}
                strokeDashoffset={24}
                d='M5 13l4 4L19 7'
                style={{
                  animation: 'drawCheck 0.4s ease-out 0.4s forwards',
                }}
              />
            </svg>
          </div>
        </div>

        <div className='w-full max-w-sm text-center animate-[fadeIn_0.4s_ease-out_0.5s_forwards] opacity-0'>
          <h2 className='text-lg font-medium text-[rgb(227,228,230)] mb-4'>
            You&apos;re on the waitlist!
          </h2>
          <p className='text-sm text-[#6b6f76]'>
            Thanks! We&apos;ll review your profile and reach out if we can get
            you in early.
          </p>
        </div>

        <style jsx>{`
          @keyframes fadeOut {
            from { opacity: 1; transform: scale(1); }
            to { opacity: 0; transform: scale(0.8); }
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.8); }
            to { opacity: 1; transform: scale(1); }
          }
          @keyframes drawCheck {
            to { stroke-dashoffset: 0; }
          }
        `}</style>

        {/* Legal links */}
        <div className='absolute bottom-4 flex gap-4 text-xs text-[#666]'>
          <Link
            href='/legal/terms'
            className='hover:text-white transition-colors no-underline'
          >
            Terms
          </Link>
          <Link
            href='/legal/privacy'
            className='hover:text-white transition-colors no-underline'
          >
            Privacy Policy
          </Link>
        </div>
      </div>
    );
  }

  const isFormValid =
    fullName.trim() && email.trim() && primarySocialUrl.trim();

  if (isHydrating) {
    return <WaitlistSkeleton />;
  }

  const spotifyOptions = spotifyResults.map(result => ({
    id: result.id,
    name: result.name,
    imageUrl: result.imageUrl,
  }));

  const handleSpotifySearchChange = (value: string) => {
    setSpotifyQuery(value);
    setSelectedSpotify(null);
    setSpotifyUrl('');
    setShowSpotifyLinkEntry(false);
    setFieldErrors(prev => ({ ...prev, spotifyUrl: undefined }));

    if (value.trim()) {
      searchSpotify(value);
    } else {
      clearSpotifySearch();
    }
  };

  const handleSpotifySelect = (option: { id: string; name: string } | null) => {
    if (!option) {
      setSelectedSpotify(null);
      setSpotifyUrl('');
      return;
    }

    const matched = spotifyResults.find(result => result.id === option.id);
    if (matched) {
      setSelectedSpotify(matched);
      setSpotifyUrl(matched.url);
      setShowSpotifyLinkEntry(false);
      setFieldErrors(prev => ({ ...prev, spotifyUrl: undefined }));
    }
  };

  const toggleSpotifyLinkEntry = () => {
    setShowSpotifyLinkEntry(prev => !prev);
    setSelectedSpotify(null);
    setSpotifyUrl('');
    setSpotifyQuery('');
    clearSpotifySearch();
    setFieldErrors(prev => ({ ...prev, spotifyUrl: undefined }));
  };

  const handleSpotifyUrlChange = (value: string) => {
    setSpotifyUrl(value);
    setSelectedSpotify(null);
    setFieldErrors(prev => ({ ...prev, spotifyUrl: undefined }));
  };

  return (
    <div className='min-h-screen flex flex-col items-center justify-center bg-[#101012] px-4'>
      {/* Logo */}
      <div className='mb-6'>
        <LogoIcon size={56} variant='white' />
      </div>

      {/* Title */}
      <h1 className='text-lg font-medium text-[rgb(227,228,230)] mb-2'>
        Join the Jovie Waitlist
      </h1>
      <p className='text-sm text-[#6b6f76] mb-8 text-center max-w-xs'>
        Jovie is invite-only. We&apos;ll review your profile for early access.
      </p>

      {/* Form */}
      <div className='w-full max-w-sm'>
        <form onSubmit={handleSubmit} className='space-y-4'>
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
            <p className='text-sm text-red-400'>{fieldErrors.fullName[0]}</p>
          )}

          <input
            type='email'
            id='email'
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className={INPUT_CLASSES}
            placeholder='Email Address'
            disabled={isSubmitting}
          />
          {fieldErrors.email && (
            <p className='text-sm text-red-400'>{fieldErrors.email[0]}</p>
          )}

          <input
            type='text'
            id='primarySocialUrl'
            value={primarySocialUrl}
            onChange={e => setPrimarySocialUrl(e.target.value)}
            required
            className={INPUT_CLASSES}
            placeholder='instagram.com/yourhandle'
            disabled={isSubmitting}
          />
          {fieldErrors.primarySocialUrl && (
            <p className='text-sm text-red-400'>
              {fieldErrors.primarySocialUrl[0]}
            </p>
          )}

          <div className='space-y-2'>
            <p className='text-sm text-[rgb(227,228,230)]'>
              Spotify artist (optional)
            </p>
            <Combobox
              className='text-left'
              options={spotifyOptions}
              value={
                selectedSpotify
                  ? {
                      id: selectedSpotify.id,
                      name: selectedSpotify.name,
                      imageUrl: selectedSpotify.imageUrl,
                    }
                  : null
              }
              onChange={handleSpotifySelect}
              onInputChange={handleSpotifySearchChange}
              placeholder='Search Spotify for your artist'
              label='Spotify artist search'
              isLoading={spotifySearchState === 'loading'}
              error={spotifySearchError}
              showCta={false}
              disabled={isSubmitting}
            />

            {selectedSpotify && !showSpotifyLinkEntry && (
              <p className='text-xs text-[#6b6f76]'>
                Selected: {selectedSpotify.name}
              </p>
            )}

            {(spotifySearchState === 'empty' || spotifySearchError) &&
              !showSpotifyLinkEntry && (
                <p className='text-xs text-[#6b6f76]'>
                  {spotifySearchError ||
                    `No Spotify results for “${spotifyQuery}”. Paste your artist link instead.`}
                </p>
              )}

            <button
              type='button'
              onClick={toggleSpotifyLinkEntry}
              className='text-xs text-white underline-offset-4 hover:underline'
              disabled={isSubmitting}
            >
              {showSpotifyLinkEntry
                ? 'Back to Spotify search'
                : "Can't find your artist? Paste the Spotify link"}
            </button>

            {showSpotifyLinkEntry && (
              <input
                type='text'
                id='spotifyUrl'
                value={spotifyUrl}
                onChange={e => handleSpotifyUrlChange(e.target.value)}
                className={INPUT_CLASSES}
                placeholder='https://open.spotify.com/artist/...'
                disabled={isSubmitting}
              />
            )}

            {fieldErrors.spotifyUrl && (
              <p className='text-sm text-red-400'>
                {fieldErrors.spotifyUrl[0]}
              </p>
            )}
          </div>

          <input
            type='text'
            id='heardAbout'
            value={heardAbout}
            onChange={e => setHeardAbout(e.target.value)}
            className={INPUT_CLASSES}
            placeholder='How did you hear about us? (optional)'
            disabled={isSubmitting}
          />

          {error && (
            <div className='text-red-400 text-sm text-center'>{error}</div>
          )}

          <button
            type='submit'
            disabled={isSubmitting || !isFormValid}
            className={BUTTON_CLASSES}
          >
            {isSubmitting ? 'Submitting…' : 'Join the Waitlist'}
          </button>
        </form>
      </div>

      {/* Footer */}
      <p className='mt-8 text-sm text-[#6b6f76]'>
        Already have access?{' '}
        <Link href='/signin' className='text-white hover:underline'>
          Sign in
        </Link>
      </p>

      {/* Legal links */}
      <div className='absolute bottom-4 flex gap-4 text-xs text-[#666]'>
        <Link
          href='/legal/terms'
          className='hover:text-white transition-colors no-underline'
        >
          Terms
        </Link>
        <Link
          href='/legal/privacy'
          className='hover:text-white transition-colors no-underline'
        >
          Privacy Policy
        </Link>
      </div>
    </div>
  );
}
