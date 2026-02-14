'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { AuthLayout, SignUpForm } from '@/components/auth';

/**
 * Persist Spotify data from homepage hero search into sessionStorage.
 * This data survives Clerk's auth redirects (OTP, SSO callbacks)
 * and is consumed by the onboarding flow after signup.
 */
function SpotifyDataPersistence() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const spotifyUrl = searchParams.get('spotify_url');
    const artistName = searchParams.get('artist_name');

    if (spotifyUrl) {
      try {
        sessionStorage.setItem('jovie_signup_spotify_url', spotifyUrl);
      } catch {
        // sessionStorage may be unavailable (incognito quota, etc.)
      }
    }
    if (artistName) {
      try {
        sessionStorage.setItem('jovie_signup_artist_name', artistName);
      } catch {
        // sessionStorage may be unavailable
      }
    }
  }, [searchParams]);

  return null;
}

/**
 * Sign-up page using new Clerk Core API implementation.
 * No longer depends on Clerk Elements.
 *
 * When arriving from the homepage Spotify search, query params
 * (spotify_url, artist_name) are persisted to sessionStorage
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
        <SpotifyDataPersistence />
      </Suspense>
      <SignUpForm />
    </AuthLayout>
  );
}
