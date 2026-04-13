'use client';

import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { ClaimBannerVariant } from '@/app/[username]/_lib/claim-banner-state';
import { track } from '@/lib/analytics';

export interface ClaimBannerProps {
  readonly profileHandle: string;
  readonly displayName?: string;
  readonly ctaHref?: string;
  readonly ctaLabel?: string;
  readonly variant?: ClaimBannerVariant;
}

const COPY: Record<
  ClaimBannerVariant,
  { body: string; ctaLabel: string | null }
> = {
  organic: {
    body: 'Is this your profile? Claim it with Spotify in about a minute.',
    ctaLabel: 'Claim Profile',
  },
  claim_intent: {
    body: 'Your profile is ready. Claim it to turn on release emails.',
    ctaLabel: 'Claim Profile',
  },
  direct_in_progress: {
    body: 'Finish claiming this profile to connect Spotify and go live.',
    ctaLabel: 'Continue Claim',
  },
  unsupported: {
    body: 'This profile needs a claim link before it can be claimed.',
    ctaLabel: null,
  },
};

export function ClaimBanner({
  profileHandle,
  displayName,
  ctaHref,
  ctaLabel,
  variant = 'organic',
}: ClaimBannerProps) {
  const trackedImpressionKeys = useRef<Set<string>>(new Set());
  const copy = COPY[variant];
  const resolvedCtaLabel = ctaLabel ?? copy.ctaLabel;
  const trackedDestination = ctaHref?.startsWith('/claim/')
    ? '/claim/[token]'
    : ctaHref;

  useEffect(() => {
    const impressionKey = `${profileHandle}:${variant}`;
    if (trackedImpressionKeys.current.has(impressionKey)) return;
    trackedImpressionKeys.current.add(impressionKey);

    track('profile_claim_banner_impression', {
      profile_handle: profileHandle,
      variant,
    });
  }, [profileHandle, variant]);

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
              className='h-4 w-4 shrink-0 max-sm:hidden'
              aria-hidden='true'
            />
            <p className='text-xs sm:text-sm font-semibold leading-tight tracking-tight'>
              {copy.body}
            </p>
          </div>

          {ctaHref && resolvedCtaLabel ? (
            <Link
              href={ctaHref}
              className='inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-btn-primary text-btn-primary-foreground font-semibold text-xs sm:text-sm shadow-sm ring-1 ring-subtle hover:opacity-95 transition-opacity focus-ring-transparent-offset'
              data-testid='claim-banner-cta'
              aria-label={`${resolvedCtaLabel} for ${name}`}
              onClick={() => {
                track('profile_claim_banner_click', {
                  profile_handle: profileHandle,
                  destination: trackedDestination,
                  variant,
                });
              }}
            >
              {resolvedCtaLabel}
              <ArrowRight
                className='h-3.5 w-3.5 sm:h-4 sm:w-4'
                aria-hidden='true'
              />
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
