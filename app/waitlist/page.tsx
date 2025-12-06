'use client';

import Link from 'next/link';
import { useState } from 'react';

interface FormErrors {
  fullName?: string[];
  email?: string[];
  primarySocialUrl?: string[];
  spotifyUrl?: string[];
}

export default function WaitlistPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [primarySocialUrl, setPrimarySocialUrl] = useState('');
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [heardAbout, setHeardAbout] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    setFieldErrors({});

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email,
          primarySocialUrl,
          spotifyUrl: spotifyUrl || null,
          heardAbout: heardAbout || null,
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
      <div className='min-h-screen bg-surface-0 transition-colors'>
        <div className='container mx-auto px-4 py-16'>
          <div className='max-w-md mx-auto text-center'>
            <div className='bg-surface-1 rounded-2xl p-8 border border-subtle shadow-sm'>
              <div className='mb-6'>
                <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30'>
                  <svg
                    className='h-6 w-6 text-emerald-600 dark:text-emerald-400'
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke='currentColor'
                    aria-hidden='true'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M5 13l4 4L19 7'
                    />
                  </svg>
                </div>
              </div>
              <h2 className='text-2xl font-bold text-primary-token mb-4'>
                You&apos;re on the waitlist!
              </h2>
              <p className='text-secondary-token'>
                Thanks! We&apos;ll review your profile and reach out if we can
                get you in early.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isFormValid =
    fullName.trim() && email.trim() && primarySocialUrl.trim();

  return (
    <div className='min-h-screen bg-surface-0 transition-colors'>
      <div className='container mx-auto px-4 py-16'>
        <div className='max-w-md mx-auto'>
          <div className='text-center mb-8'>
            <h1 className='text-3xl md:text-4xl font-bold text-primary-token mb-3'>
              Jovie is invite-only.
            </h1>
            <p className='text-secondary-token'>
              Join the waitlist and we&apos;ll review your profile for early
              access.
            </p>
          </div>

          <div className='bg-surface-1 rounded-2xl p-6 md:p-8 border border-subtle shadow-sm'>
            <form onSubmit={handleSubmit} className='space-y-5'>
              {/* Full Name */}
              <div>
                <label
                  htmlFor='fullName'
                  className='block text-sm font-medium text-primary-token mb-1.5'
                >
                  Full name <span className='text-rose-500'>*</span>
                </label>
                <input
                  type='text'
                  id='fullName'
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                  className='w-full px-4 py-2.5 border border-subtle rounded-lg bg-surface-0 text-primary-token placeholder-tertiary-token focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-transparent transition-colors'
                  placeholder='Your name'
                  disabled={isSubmitting}
                />
                {fieldErrors.fullName && (
                  <p className='mt-1 text-sm text-rose-500'>
                    {fieldErrors.fullName[0]}
                  </p>
                )}
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor='email'
                  className='block text-sm font-medium text-primary-token mb-1.5'
                >
                  Email <span className='text-rose-500'>*</span>
                </label>
                <input
                  type='email'
                  id='email'
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className='w-full px-4 py-2.5 border border-subtle rounded-lg bg-surface-0 text-primary-token placeholder-tertiary-token focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-transparent transition-colors'
                  placeholder='you@example.com'
                  disabled={isSubmitting}
                />
                {fieldErrors.email && (
                  <p className='mt-1 text-sm text-rose-500'>
                    {fieldErrors.email[0]}
                  </p>
                )}
              </div>

              {/* Primary Social URL */}
              <div>
                <label
                  htmlFor='primarySocialUrl'
                  className='block text-sm font-medium text-primary-token mb-1.5'
                >
                  Link to your largest social media profile{' '}
                  <span className='text-rose-500'>*</span>
                </label>
                <input
                  type='url'
                  id='primarySocialUrl'
                  value={primarySocialUrl}
                  onChange={e => setPrimarySocialUrl(e.target.value)}
                  required
                  className='w-full px-4 py-2.5 border border-subtle rounded-lg bg-surface-0 text-primary-token placeholder-tertiary-token focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-transparent transition-colors'
                  placeholder='https://instagram.com/yourhandle'
                  disabled={isSubmitting}
                />
                {fieldErrors.primarySocialUrl && (
                  <p className='mt-1 text-sm text-rose-500'>
                    {fieldErrors.primarySocialUrl[0]}
                  </p>
                )}
                <p className='mt-1 text-xs text-tertiary-token'>
                  Instagram, TikTok, YouTube, X, Twitch, Linktree, etc.
                </p>
              </div>

              {/* Spotify URL (optional) */}
              <div>
                <label
                  htmlFor='spotifyUrl'
                  className='block text-sm font-medium text-primary-token mb-1.5'
                >
                  Spotify artist/profile URL{' '}
                  <span className='text-tertiary-token'>(optional)</span>
                </label>
                <input
                  type='url'
                  id='spotifyUrl'
                  value={spotifyUrl}
                  onChange={e => setSpotifyUrl(e.target.value)}
                  className='w-full px-4 py-2.5 border border-subtle rounded-lg bg-surface-0 text-primary-token placeholder-tertiary-token focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-transparent transition-colors'
                  placeholder='https://open.spotify.com/artist/...'
                  disabled={isSubmitting}
                />
                {fieldErrors.spotifyUrl && (
                  <p className='mt-1 text-sm text-rose-500'>
                    {fieldErrors.spotifyUrl[0]}
                  </p>
                )}
              </div>

              {/* Heard About (optional) */}
              <div>
                <label
                  htmlFor='heardAbout'
                  className='block text-sm font-medium text-primary-token mb-1.5'
                >
                  How did you hear about Jovie?{' '}
                  <span className='text-tertiary-token'>(optional)</span>
                </label>
                <input
                  type='text'
                  id='heardAbout'
                  value={heardAbout}
                  onChange={e => setHeardAbout(e.target.value)}
                  className='w-full px-4 py-2.5 border border-subtle rounded-lg bg-surface-0 text-primary-token placeholder-tertiary-token focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-transparent transition-colors'
                  placeholder='Friend, social media, search, etc.'
                  disabled={isSubmitting}
                />
              </div>

              {/* Generic error */}
              {error && (
                <div className='text-rose-500 text-sm text-center'>{error}</div>
              )}

              {/* Submit button */}
              <button
                type='submit'
                disabled={isSubmitting || !isFormValid}
                className='w-full bg-primary-token text-inverse-token font-semibold py-3 px-6 rounded-lg transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {isSubmitting ? 'Submitting…' : 'Join the waitlist'}
              </button>
            </form>
          </div>

          <div className='mt-8 text-center'>
            <p className='text-sm text-tertiary-token'>
              Already have access?{' '}
              <Link
                href='/signin'
                className='text-accent hover:underline font-medium'
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
