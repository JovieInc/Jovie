'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { AuthLayout, SignUpForm } from '@/components/auth';

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
      // Clear stale values before persisting new ones
      sessionStorage.removeItem('jovie_signup_spotify_url');
      sessionStorage.removeItem('jovie_signup_artist_name');

      if (spotifyUrl) {
        sessionStorage.setItem('jovie_signup_spotify_url', spotifyUrl);
      }
      if (artistName) {
        sessionStorage.setItem('jovie_signup_artist_name', artistName);
      }

      if (handle) {
        sessionStorage.setItem(
          'pendingClaim',
          JSON.stringify({ handle: handle.toLowerCase(), ts: Date.now() })
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
      showFooterPrompt={false}
    >
      <Suspense>
        <SignUpClaimDataPersistence />
      </Suspense>
      <SignUpForm />
    </AuthLayout>
  );
}
