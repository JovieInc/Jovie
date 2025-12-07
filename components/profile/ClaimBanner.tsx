'use client';

import { useUser } from '@clerk/nextjs';
import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useCallback } from 'react';

export interface ClaimBannerProps {
  /** The claim token for this profile */
  claimToken: string;
  /** The profile handle/username */
  profileHandle: string;
  /** Optional: Override the display name shown in the banner */
  displayName?: string;
}

/**
 * ClaimBanner displays a prominent banner on unclaimed profiles,
 * allowing the rightful owner to claim their profile.
 *
 * Behavior:
 * - If user is signed in: links directly to /claim/{token}
 * - If user is signed out: links to /signup with redirect_url to /claim/{token}
 */
export function ClaimBanner({
  claimToken,
  profileHandle,
  displayName,
}: ClaimBannerProps) {
  const { isSignedIn, isLoaded } = useUser();

  const claimPath = `/claim/${encodeURIComponent(claimToken)}`;

  // Build the appropriate URL based on auth state
  const getClaimUrl = useCallback(() => {
    if (!isLoaded) {
      // While loading, default to signup flow (safer)
      return `/signup?redirect_url=${encodeURIComponent(claimPath)}`;
    }

    if (isSignedIn) {
      // Signed in users go directly to claim
      return claimPath;
    }

    // Signed out users go through signup with redirect
    return `/signup?redirect_url=${encodeURIComponent(claimPath)}`;
  }, [isLoaded, isSignedIn, claimPath]);

  const name = displayName || profileHandle;

  return (
    <div
      className='w-full bg-linear-to-r from-indigo-600 via-purple-600 to-pink-500 text-white'
      role='banner'
      aria-label='Claim profile banner'
      data-testid='claim-banner'
    >
      <div className='max-w-4xl mx-auto px-4 py-3 sm:py-4'>
        <div className='flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4'>
          {/* Banner text */}
          <div className='flex items-center gap-2 text-center sm:text-left'>
            <Sparkles
              className='h-5 w-5 shrink-0 hidden sm:block'
              aria-hidden='true'
            />
            <p className='text-sm sm:text-base font-medium'>
              <span className='hidden sm:inline'>Is this your profile? </span>
              <span className='sm:hidden'>Your profile? </span>
              <span className='font-semibold'>Claim {name}</span>
            </p>
          </div>

          {/* CTA Button */}
          <Link
            href={getClaimUrl()}
            className='inline-flex items-center gap-2 px-4 py-2 bg-white text-indigo-700 font-semibold text-sm rounded-full hover:bg-indigo-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600'
            data-testid='claim-banner-cta'
            aria-label={`Claim profile for ${name}`}
          >
            Claim Profile
            <ArrowRight className='h-4 w-4' aria-hidden='true' />
          </Link>
        </div>
      </div>
    </div>
  );
}
