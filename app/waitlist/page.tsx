'use client';

import Link from 'next/link';
import { useState } from 'react';
import { LogoIcon } from '@/components/atoms/LogoIcon';

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
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [primarySocialUrl, setPrimarySocialUrl] = useState('');
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [heardAbout, setHeardAbout] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const validateField = (field: string, value: string) => {
    const newErrors = { ...fieldErrors };

    switch (field) {
      case 'fullName':
        if (!value.trim()) {
          newErrors.fullName = ['Full name is required'];
        } else {
          delete newErrors.fullName;
        }
        break;
      case 'email':
        if (!value.trim()) {
          newErrors.email = ['Email is required'];
        } else if (!isValidEmail(value)) {
          newErrors.email = ['Please enter a valid email address'];
        } else {
          delete newErrors.email;
        }
        break;
      case 'primarySocialUrl':
        if (!value.trim()) {
          newErrors.primarySocialUrl = ['Social profile link is required'];
        } else if (!isValidUrl(value)) {
          newErrors.primarySocialUrl = [
            'Please enter a valid URL (e.g., instagram.com/yourhandle)',
          ];
        } else {
          delete newErrors.primarySocialUrl;
        }
        break;
      case 'spotifyUrl':
        if (value.trim() && !isValidUrl(value)) {
          newErrors.spotifyUrl = [
            'Please enter a valid Spotify URL (e.g., open.spotify.com/artist/...)',
          ];
        } else {
          delete newErrors.spotifyUrl;
        }
        break;
    }

    setFieldErrors(newErrors);
  };

  const handleBlur = (field: string, value: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    validateField(field, value);
  };

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
            onBlur={e => handleBlur('fullName', e.target.value)}
            required
            className={`${INPUT_CLASSES} ${touched.fullName && fieldErrors.fullName ? 'ring-1 ring-red-500' : ''}`}
            placeholder='Full Name'
            disabled={isSubmitting}
          />
          {touched.fullName && fieldErrors.fullName && (
            <p className='text-sm text-red-400'>{fieldErrors.fullName[0]}</p>
          )}

          <input
            type='email'
            id='email'
            value={email}
            onChange={e => setEmail(e.target.value)}
            onBlur={e => handleBlur('email', e.target.value)}
            required
            className={`${INPUT_CLASSES} ${touched.email && fieldErrors.email ? 'ring-1 ring-red-500' : ''}`}
            placeholder='Email Address'
            disabled={isSubmitting}
          />
          {touched.email && fieldErrors.email && (
            <p className='text-sm text-red-400'>{fieldErrors.email[0]}</p>
          )}

          <input
            type='text'
            id='primarySocialUrl'
            value={primarySocialUrl}
            onChange={e => setPrimarySocialUrl(e.target.value)}
            onBlur={e => handleBlur('primarySocialUrl', e.target.value)}
            required
            className={`${INPUT_CLASSES} ${touched.primarySocialUrl && fieldErrors.primarySocialUrl ? 'ring-1 ring-red-500' : ''}`}
            placeholder='instagram.com/yourhandle'
            disabled={isSubmitting}
          />
          {touched.primarySocialUrl && fieldErrors.primarySocialUrl && (
            <p className='text-sm text-red-400'>
              {fieldErrors.primarySocialUrl[0]}
            </p>
          )}

          <input
            type='text'
            id='spotifyUrl'
            value={spotifyUrl}
            onChange={e => setSpotifyUrl(e.target.value)}
            onBlur={e => handleBlur('spotifyUrl', e.target.value)}
            className={`${INPUT_CLASSES} ${touched.spotifyUrl && fieldErrors.spotifyUrl ? 'ring-1 ring-red-500' : ''}`}
            placeholder='open.spotify.com/artist/... (optional)'
            disabled={isSubmitting}
          />
          {touched.spotifyUrl && fieldErrors.spotifyUrl && (
            <p className='text-sm text-red-400'>{fieldErrors.spotifyUrl[0]}</p>
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
