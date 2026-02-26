'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { AuthLayout, SignUpForm } from '@/components/auth';
import { APP_ROUTES } from '@/constants/routes';
import {
  clearSignupClaimValue,
  persistSignupClaimValue,
  SIGNUP_ARTIST_NAME_KEY,
  SIGNUP_SPOTIFY_EXPECTED_KEY,
  SIGNUP_SPOTIFY_URL_KEY,
} from '@/lib/auth/signup-claim-storage';

/**
 * Persist pre-signup claim data from the homepage hero into sessionStorage.
 * This data survives Clerk's auth redirects (OTP, SSO callbacks)
 * and is consumed by the onboarding flow after signup.
 */
function SignUpClaimDataPersistence() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const spotifyUrl = searchParams.get('spotify_url');
    const artistName = searchParams.get('artist_name');
    const handle = searchParams.get('handle');

    try {
      const now = Date.now();

      // Clear stale values before persisting new ones
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
  }, [searchParams]);

  return null;
}

/**
 * Sign-up page using new Clerk Core API implementation.
 * No longer depends on Clerk Elements.
 *
 * When arriving from the homepage claim flow, query params
 * (handle, spotify_url, artist_name) are persisted to sessionStorage
 * for use during onboarding.
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
