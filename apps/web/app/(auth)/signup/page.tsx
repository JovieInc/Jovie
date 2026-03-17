'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { AuthLayout, SignUpForm } from '@/features/auth';
import {
  clearSignupClaimValue,
  persistSignupClaimValue,
  SIGNUP_ARTIST_NAME_KEY,
  SIGNUP_SPOTIFY_EXPECTED_KEY,
  SIGNUP_SPOTIFY_URL_KEY,
} from '@/lib/auth/signup-claim-storage';

/**
 * Persist pre-signup claim data from the homepage hero into sessionStorage,
 * and display a handle availability banner when a handle param is present.
 */
function SignUpClaimDataPersistence() {
  const searchParams = useSearchParams();
  const handle = searchParams.get('handle');
  const [availability, setAvailability] = useState<
    'checking' | 'available' | 'taken' | null
  >(null);

  useEffect(() => {
    const spotifyUrl = searchParams.get('spotify_url');
    const artistName = searchParams.get('artist_name');

    try {
      const now = Date.now();

      clearSignupClaimValue(SIGNUP_SPOTIFY_URL_KEY);
      clearSignupClaimValue(SIGNUP_ARTIST_NAME_KEY);
      clearSignupClaimValue(SIGNUP_SPOTIFY_EXPECTED_KEY);

      if (spotifyUrl) {
        persistSignupClaimValue(SIGNUP_SPOTIFY_URL_KEY, spotifyUrl, now);
        persistSignupClaimValue(SIGNUP_SPOTIFY_EXPECTED_KEY, 'true', now);
      }
      if (artistName) {
        persistSignupClaimValue(SIGNUP_ARTIST_NAME_KEY, artistName, now);
      }

      if (handle) {
        sessionStorage.setItem(
          'pendingClaim',
          JSON.stringify({ handle: handle.toLowerCase(), ts: now })
        );
      }
    } catch {
      // sessionStorage may be unavailable (incognito quota, etc.)
    }
  }, [searchParams, handle]);

  useEffect(() => {
    if (!handle || handle.length < 3) return;

    setAvailability('checking');

    const controller = new AbortController();
    fetch(
      `/api/handle/check?handle=${encodeURIComponent(handle.toLowerCase())}`,
      { signal: controller.signal }
    )
      .then(res => res.json())
      .then(data => {
        setAvailability(data.available ? 'available' : 'taken');
      })
      .catch(() => {
        setAvailability(null);
      });

    return () => controller.abort();
  }, [handle]);

  const normalizedHandle = useMemo(() => handle?.toLowerCase() ?? '', [handle]);

  if (!handle || !availability) return null;

  return (
    <div className='mb-4 rounded-(--linear-radius-sm) border border-subtle bg-surface-1 px-4 py-3 text-center'>
      {availability === 'checking' && (
        <p className='text-[13px] font-[450] text-secondary-token'>
          Checking if @{normalizedHandle} is available...
        </p>
      )}
      {availability === 'available' && (
        <p className='text-[13px] font-[450] text-primary-token'>
          @{normalizedHandle} is available. Sign up to claim it.
        </p>
      )}
      {availability === 'taken' && (
        <p className='text-[13px] font-[450] text-secondary-token'>
          @{normalizedHandle} is already taken. You can pick another handle
          after signing up.
        </p>
      )}
    </div>
  );
}

/**
 * Sign-up page using new Clerk Core API implementation.
 */
export default function SignUpPage() {
  return (
    <AuthLayout
      formTitle='Create your account'
      showFormTitle={false}
      footerPrompt='Already have an account?'
      footerLinkText='Sign in'
      footerLinkHref={APP_ROUTES.SIGNIN}
    >
      <Suspense>
        <SignUpClaimDataPersistence />
      </Suspense>
      <SignUpForm />
    </AuthLayout>
  );
}
