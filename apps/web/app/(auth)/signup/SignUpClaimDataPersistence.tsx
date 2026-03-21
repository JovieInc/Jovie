'use client';

import { useEffect, useMemo, useState } from 'react';
import { track } from '@/lib/analytics';
import { setPlanIntent, validatePlan } from '@/lib/auth/plan-intent';
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
export function SignUpClaimDataPersistence() {
  const [handle, setHandle] = useState<string | null>(null);
  const [availability, setAvailability] = useState<
    'checking' | 'available' | 'taken' | 'error' | null
  >(null);

  useEffect(() => {
    const searchParams = new URL(globalThis.location.href).searchParams;
    const nextHandle = searchParams.get('handle');
    const spotifyUrl = searchParams.get('spotify_url');
    const artistName = searchParams.get('artist_name');
    const plan = searchParams.get('plan');

    setHandle(nextHandle);

    if (plan) {
      const validatedPlan = validatePlan(plan);
      if (validatedPlan) {
        setPlanIntent(validatedPlan);
        let source = 'pricing';
        if (spotifyUrl) source = 'hero_spotify';
        else if (nextHandle) source = 'hero_claim';
        track('plan_intent_captured', { plan: validatedPlan, source });
      }
    }

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

      if (nextHandle) {
        sessionStorage.setItem(
          'pendingClaim',
          JSON.stringify({ handle: nextHandle.toLowerCase(), ts: now })
        );
      }
    } catch {
      // sessionStorage may be unavailable (incognito quota, etc.)
    }
  }, []);

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
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setAvailability('error');
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
      {availability === 'error' && (
        <p className='text-[13px] font-[450] text-secondary-token'>
          Couldn&apos;t check if @{normalizedHandle} is available. You can still
          sign up and choose a handle.
        </p>
      )}
    </div>
  );
}
