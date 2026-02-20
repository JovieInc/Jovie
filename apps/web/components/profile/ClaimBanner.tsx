'use client';

import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef } from 'react';
import { useUserSafe } from '@/hooks/useClerkSafe';
import { track } from '@/lib/analytics';

export interface ClaimBannerProps {
  /** The claim token for this profile */
  readonly claimToken: string;
  /** The profile handle/username */
  readonly profileHandle: string;
  /** Optional: Override the display name shown in the banner */
  readonly displayName?: string;
}

/**
 * ClaimBanner displays a prominent banner on unclaimed profiles,
 * allowing the rightful owner to claim their profile.
 *
 * Behavior:
 * - If user is signed in: links directly to /{username}/claim?token={token}
 * - If user is signed out: links to /signup with redirect_url
 */
export function ClaimBanner({
  claimToken,
  profileHandle,
  displayName,
}: ClaimBannerProps) {
  const { isSignedIn, isLoaded } = useUserSafe();
  const hasTrackedImpression = useRef(false);

  const claimPath = `/${encodeURIComponent(profileHandle)}/claim?token=${encodeURIComponent(claimToken)}`;

  const claimUrl = useMemo(() => {
    if (!isLoaded) {
      return `/signup?redirect_url=${encodeURIComponent(claimPath)}`;
    }

    if (isSignedIn) {
      return claimPath;
    }

    return `/signup?redirect_url=${encodeURIComponent(claimPath)}`;
  }, [isLoaded, isSignedIn, claimPath]);

  useEffect(() => {
    if (!isLoaded) return;
    if (hasTrackedImpression.current) return;
    hasTrackedImpression.current = true;

    track('profile_claim_banner_impression', {
      profile_handle: profileHandle,
      claim_path: claimPath,
      is_signed_in: isSignedIn,
      auth_loaded: isLoaded,
    });
  }, [claimPath, isLoaded, isSignedIn, profileHandle]);

  const name = displayName || profileHandle;

  return (
    <header
      className='relative w-full overflow-hidden bg-base text-primary-token border-b border-subtle'
      data-testid='claim-banner'
    >
      <div className='absolute inset-0 bg-surface-1 opacity-60' aria-hidden />
      <div className='relative max-w-4xl mx-auto px-4 py-2 sm:py-3'>
        <div className='flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3'>
          {/* Banner text */}
          <div className='flex items-center gap-2 text-center sm:text-left max-w-xs sm:max-w-sm'>
            <Sparkles
              className='h-4 w-4 shrink-0 hidden sm:block'
              aria-hidden='true'
            />
            <p className='text-xs sm:text-sm font-semibold leading-tight tracking-tight'>
              Is this your profile? Claim it in 30 seconds.
            </p>
          </div>

          {/* CTA Button */}
          <Link
            href={claimUrl}
            className='inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-btn-primary text-btn-primary-foreground font-semibold text-xs sm:text-sm shadow-sm ring-1 ring-subtle hover:opacity-95 transition-opacity focus-ring-transparent-offset'
            data-testid='claim-banner-cta'
            aria-label={`Claim profile for ${name}`}
            onClick={() => {
              track('profile_claim_banner_click', {
                profile_handle: profileHandle,
                claim_path: claimPath,
                destination: claimUrl,
                is_signed_in: isSignedIn,
                auth_loaded: isLoaded,
              });
            }}
          >
            Claim Profile
            <ArrowRight
              className='h-3.5 w-3.5 sm:h-4 sm:w-4'
              aria-hidden='true'
            />
          </Link>
        </div>
      </div>
    </header>
  );
}
