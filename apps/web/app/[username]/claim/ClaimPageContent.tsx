'use client';

import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback } from 'react';
import { useUserSafe } from '@/hooks/useClerkSafe';

interface ClaimPageContentProps {
  readonly username: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly claimToken: string;
}

export function ClaimPageContent({
  username,
  displayName,
  avatarUrl,
  claimToken,
}: ClaimPageContentProps) {
  const { isSignedIn, isLoaded } = useUserSafe();

  const claimPath = `/${encodeURIComponent(username)}/claim?token=${encodeURIComponent(claimToken)}`;

  const getClaimUrl = useCallback(() => {
    if (!isLoaded || !isSignedIn) {
      return `/signup?redirect_url=${encodeURIComponent(claimPath)}`;
    }
    return claimPath;
  }, [isLoaded, isSignedIn, claimPath]);

  return (
    <div className='flex min-h-dvh flex-col items-center justify-center bg-base px-4'>
      <div className='w-full max-w-sm text-center'>
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={displayName}
            width={80}
            height={80}
            className='mx-auto mb-4 rounded-full object-cover'
          />
        ) : (
          <div className='mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-surface-1 text-2xl font-semibold text-secondary-token'>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}

        <h1 className='mb-1 text-xl font-semibold text-primary-token'>
          Claim {displayName}
        </h1>
        <p className='mb-6 text-sm text-secondary-token'>
          This profile for <span className='font-medium'>@{username}</span> is
          ready for you to claim. It only takes 30 seconds.
        </p>

        <Link
          href={getClaimUrl()}
          className='inline-flex items-center gap-2 rounded-full bg-btn-primary px-6 py-2.5 text-sm font-semibold text-btn-primary-foreground shadow-sm ring-1 ring-subtle transition-opacity hover:opacity-95 focus-ring-transparent-offset'
          data-testid='claim-page-cta'
        >
          {isLoaded && isSignedIn ? 'Claim Profile' : 'Sign Up to Claim'}
          <ArrowRight className='h-4 w-4' aria-hidden='true' />
        </Link>

        <p className='mt-4 text-xs text-tertiary-token'>
          Free forever. No credit card required.
        </p>
      </div>
    </div>
  );
}
