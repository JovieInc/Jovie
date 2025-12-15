'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
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
  'w-full rounded-lg border border-white/5 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/50 shadow-[0_8px_30px_rgba(0,0,0,0.25)] transition-all duration-150 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-60 disabled:cursor-not-allowed';
const BUTTON_CLASSES =
  'w-full rounded-lg bg-white text-[#0b0d11] font-medium py-3 px-4 text-sm transition-colors duration-150 hover:bg-white/90 disabled:opacity-60 disabled:cursor-not-allowed';

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
  const [spotifyEntryMode, setSpotifyEntryMode] = useState<'search' | 'manual'>(
    'search'
  );
  const [selectedArtist, setSelectedArtist] =
    useState<SpotifyArtistResult | null>(null);
  const [manualSpotifyUrl, setManualSpotifyUrl] = useState('');
  const [heardAbout, setHeardAbout] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});

  const {
    results: searchResults,
    state: searchState,
    error: searchError,
    search: searchArtists,
    clear: clearSearch,
  } = useArtistSearch({ debounceMs: 250, limit: 8 });

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

    if (spotifyEntryMode === 'manual' && manualSpotifyUrl.trim()) {
      if (!isValidUrl(manualSpotifyUrl)) {
        errors.spotifyUrl = ['Please enter a valid Spotify artist link'];
      }
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
          spotifyUrl: selectedArtist?.url
            ? normalizeUrl(selectedArtist.url)
            : manualSpotifyUrl
              ? normalizeUrl(manualSpotifyUrl)
              : null,
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

  const comboboxOptions = useMemo(
    () =>
      searchResults.map(artist => ({
        id: artist.id,
        name: artist.name,
        imageUrl: artist.imageUrl,
      })),
    [searchResults]
  );

  const isSearching = searchState === 'loading';
  const showEmptyState = searchState === 'empty' && searchResults.length === 0;

  const handleArtistSelect = (
    option: { id: string; name: string; imageUrl?: string } | null
  ) => {
    if (!option) {
      setSelectedArtist(null);
      setFieldErrors(prev => ({ ...prev, spotifyUrl: undefined }));
      return;
    }

    const foundArtist = searchResults.find(artist => artist.id === option.id);
    if (foundArtist) {
      setSelectedArtist(foundArtist);
      setSpotifyEntryMode('search');
      setManualSpotifyUrl('');
      setFieldErrors(prev => ({ ...prev, spotifyUrl: undefined }));
    }
  };

  const handleArtistSearchInput = (value: string) => {
    if (value.trim()) {
      searchArtists(value);
    } else {
      clearSearch();
      setSelectedArtist(null);
    }

    setFieldErrors(prev => ({ ...prev, spotifyUrl: undefined }));
  };

  const switchToManual = () => {
    setSpotifyEntryMode('manual');
    setSelectedArtist(null);
    clearSearch();
    setFieldErrors(prev => ({ ...prev, spotifyUrl: undefined }));
  };

  const switchToSearch = () => {
    setSpotifyEntryMode('search');
    setManualSpotifyUrl('');
    setFieldErrors(prev => ({ ...prev, spotifyUrl: undefined }));
  };

  const handleManualUrlChange = (value: string) => {
    setManualSpotifyUrl(value);
    setSelectedArtist(null);
    setFieldErrors(prev => ({ ...prev, spotifyUrl: undefined }));
  };

  if (isSubmitted) {
    return (
      <div className='min-h-screen flex flex-col items-center justify-center bg-[#050608] px-4 text-white'>
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
          <h2 className='text-xl font-semibold text-white mb-4'>
            You&apos;re on the waitlist!
          </h2>
          <p className='text-sm text-white/70'>
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
        <div className='absolute bottom-4 flex gap-4 text-xs text-white/50'>
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

  return (
    <div className='relative min-h-screen overflow-hidden bg-[#050608] text-white'>
      <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.06),transparent_35%),radial-gradient(circle_at_75%_10%,rgba(94,234,212,0.08),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_35%)]' />
      <div className='relative flex min-h-screen items-center justify-center px-4 py-12'>
        <div className='w-full max-w-xl space-y-8'>
          {/* Header */}
          <div className='space-y-3 text-center'>
            <div className='flex justify-center'>
              <LogoIcon size={56} variant='white' />
            </div>
            <h1 className='text-2xl font-semibold tracking-tight text-white'>
              Join the Jovie waitlist
            </h1>
            <p className='text-sm text-white/70 max-w-lg mx-auto'>
              Tell us how to reach you. We review every request to keep the
              experience curated and early-access ready.
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className='space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl'
          >
            <div className='space-y-2'>
              <label
                htmlFor='fullName'
                className='text-sm font-medium text-white/80'
              >
                Full name
              </label>
              <input
                type='text'
                id='fullName'
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                className={INPUT_CLASSES}
                placeholder='Your full name'
                disabled={isSubmitting}
              />
              {fieldErrors.fullName && (
                <p className='text-xs text-[#ff9b9b]'>
                  {fieldErrors.fullName[0]}
                </p>
              )}
            </div>

            <div className='space-y-2'>
              <label
                htmlFor='email'
                className='text-sm font-medium text-white/80'
              >
                Email
              </label>
              <input
                type='email'
                id='email'
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className={INPUT_CLASSES}
                placeholder='name@email.com'
                disabled={isSubmitting}
                autoComplete='email'
              />
              {fieldErrors.email && (
                <p className='text-xs text-[#ff9b9b]'>{fieldErrors.email[0]}</p>
              )}
            </div>

            <div className='space-y-2'>
              <label
                htmlFor='primarySocialUrl'
                className='text-sm font-medium text-white/80'
              >
                Primary social link
              </label>
              <input
                type='text'
                id='primarySocialUrl'
                value={primarySocialUrl}
                onChange={e => setPrimarySocialUrl(e.target.value)}
                required
                className={INPUT_CLASSES}
                placeholder='instagram.com/yourhandle'
                disabled={isSubmitting}
                autoComplete='url'
              />
              {fieldErrors.primarySocialUrl && (
                <p className='text-xs text-[#ff9b9b]'>
                  {fieldErrors.primarySocialUrl[0]}
                </p>
              )}
            </div>

            <div className='space-y-3 rounded-xl border border-white/10 bg-white/5 p-4'>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <p className='text-sm font-semibold text-white'>
                    Spotify artist (optional)
                  </p>
                  <p className='text-xs text-white/60'>
                    Search Spotify or paste a link so we can verify faster.
                  </p>
                </div>
                {selectedArtist && (
                  <span className='rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-medium text-emerald-200'>
                    Artist linked
                  </span>
                )}
              </div>

              {spotifyEntryMode === 'search' ? (
                <div className='space-y-3'>
                  <Combobox
                    options={comboboxOptions}
                    value={
                      selectedArtist
                        ? {
                            id: selectedArtist.id,
                            name: selectedArtist.name,
                            imageUrl: selectedArtist.imageUrl,
                          }
                        : null
                    }
                    onChange={handleArtistSelect}
                    onInputChange={handleArtistSearchInput}
                    placeholder='Search Spotify for your artist'
                    label='Spotify artist search'
                    isLoading={isSearching}
                    error={searchError}
                    showCta={false}
                    className='w-full'
                  />

                  {selectedArtist && (
                    <div className='flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80'>
                      <div className='flex items-center gap-3'>
                        {selectedArtist.imageUrl ? (
                          <Image
                            src={selectedArtist.imageUrl}
                            alt={selectedArtist.name}
                            width={36}
                            height={36}
                            className='h-9 w-9 rounded-full object-cover'
                          />
                        ) : (
                          <div
                            className='h-9 w-9 rounded-full bg-white/10'
                            aria-hidden='true'
                          />
                        )}
                        <div className='space-y-0.5'>
                          <p className='text-sm font-medium text-white'>
                            {selectedArtist.name}
                          </p>
                          <p className='text-[11px] text-white/60'>
                            Spotify artist
                          </p>
                        </div>
                      </div>
                      <button
                        type='button'
                        onClick={() => setSelectedArtist(null)}
                        className='text-[11px] font-medium text-white/70 underline underline-offset-4 hover:text-white'
                        disabled={isSubmitting}
                      >
                        Clear
                      </button>
                    </div>
                  )}

                  {showEmptyState && (
                    <div className='flex flex-col gap-2 rounded-lg border border-white/10 bg-[#0d1016] px-3 py-3 text-xs text-white/70'>
                      <p className='font-medium text-white'>No artists found</p>
                      <p>
                        Paste your Spotify link instead and we&apos;ll review it
                        manually.
                      </p>
                      <div>
                        <button
                          type='button'
                          onClick={switchToManual}
                          className='inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-[11px] font-semibold text-white hover:bg-white/10'
                          disabled={isSubmitting}
                        >
                          Add link manually
                        </button>
                      </div>
                    </div>
                  )}

                  <div className='flex items-center justify-between text-[11px] text-white/60'>
                    <span>Prefer to paste a link?</span>
                    <button
                      type='button'
                      onClick={switchToManual}
                      className='font-semibold text-white hover:text-white/80 underline underline-offset-4'
                      disabled={isSubmitting}
                    >
                      Add Spotify link
                    </button>
                  </div>
                </div>
              ) : (
                <div className='space-y-3'>
                  <div className='flex items-center justify-between text-sm text-white/80'>
                    <span className='font-medium'>Paste your Spotify link</span>
                    <button
                      type='button'
                      onClick={switchToSearch}
                      className='text-[11px] font-semibold text-white underline underline-offset-4 hover:text-white/80'
                      disabled={isSubmitting}
                    >
                      Back to search
                    </button>
                  </div>
                  <input
                    type='text'
                    id='spotifyUrl'
                    value={manualSpotifyUrl}
                    onChange={e => handleManualUrlChange(e.target.value)}
                    className={INPUT_CLASSES}
                    placeholder='https://open.spotify.com/artist/...'
                    disabled={isSubmitting}
                  />
                  <p className='text-[11px] text-white/60'>
                    Drop your artist profile link if search couldn&apos;t find
                    you.
                  </p>
                </div>
              )}

              {fieldErrors.spotifyUrl && (
                <p className='text-xs text-[#ff9b9b]'>
                  {fieldErrors.spotifyUrl[0]}
                </p>
              )}
            </div>

            <div className='space-y-2'>
              <label
                htmlFor='heardAbout'
                className='text-sm font-medium text-white/80'
              >
                How did you hear about us? (optional)
              </label>
              <input
                type='text'
                id='heardAbout'
                value={heardAbout}
                onChange={e => setHeardAbout(e.target.value)}
                className={INPUT_CLASSES}
                placeholder='Friend, social, event, or press'
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <div className='rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100'>
                {error}
              </div>
            )}

            <button
              type='submit'
              disabled={isSubmitting || !isFormValid}
              className={BUTTON_CLASSES}
            >
              {isSubmitting ? 'Submitting…' : 'Join the waitlist'}
            </button>
          </form>

          {/* Footer */}
          <p className='text-center text-sm text-white/70'>
            Already have access?{' '}
            <Link
              href='/signin'
              className='text-white underline underline-offset-4'
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Legal links */}
        <div className='absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4 text-xs text-white/50'>
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
    </div>
  );
}
