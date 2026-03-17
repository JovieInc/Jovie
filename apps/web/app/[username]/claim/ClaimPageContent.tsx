'use client';

import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { JoviePixel } from '@/features/tracking';

interface ClaimPageContentProps {
  readonly profileId: string;
  readonly username: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
}

export function ClaimPageContent({
  profileId,
  username,
  displayName,
  avatarUrl,
}: ClaimPageContentProps) {
  const encodedRedirect = encodeURIComponent(`/${username}`);
  const signupUrl = `/signup?handle=${encodeURIComponent(username)}&redirect_url=${encodedRedirect}`;

  return (
    <>
      <JoviePixel profileId={profileId} />
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
            href={signupUrl}
            className='inline-flex items-center gap-2 rounded-full bg-btn-primary px-6 py-2.5 text-sm font-semibold text-btn-primary-foreground shadow-sm ring-1 ring-subtle transition-opacity hover:opacity-95 focus-ring-transparent-offset'
            data-testid='claim-page-cta'
          >
            Sign Up to Claim
            <ArrowRight className='h-4 w-4' aria-hidden='true' />
          </Link>

          <p className='mt-4 text-xs text-tertiary-token'>
            Free forever. No credit card required.
          </p>
        </div>
      </div>
    </>
  );
}
