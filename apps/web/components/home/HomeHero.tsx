'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { HeroSection } from '@/components/organisms/HeroSection';
import { FEATURE_FLAGS, useFeatureFlagWithLoading } from '@/lib/analytics';
import { ClaimHandleForm } from './ClaimHandleForm';

export function HomeHero({ subtitle }: Readonly<{ subtitle?: ReactNode }>) {
  const { enabled: showClaimHandle, loading } = useFeatureFlagWithLoading(
    FEATURE_FLAGS.CLAIM_HANDLE,
    false
  );

  const defaultSubtitle = subtitle ?? 'Your Jovie profile, ready in seconds.';

  const content = loading ? (
    <div className='flex flex-col items-center gap-4'>
      <div className='animate-pulse motion-reduce:animate-none'>
        <div className='h-4 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-4'></div>
        <div className='h-10 bg-gray-200 dark:bg-gray-700 rounded w-full'></div>
      </div>
    </div>
  ) : showClaimHandle ? (
    <ClaimHandleForm />
  ) : (
    <div className='flex flex-col items-center gap-4'>
      <p className='text-sm text-gray-600 dark:text-white/70'>
        Create your artist page in seconds.
      </p>
      <Button asChild size='lg' data-test='signup-btn'>
        <Link href='/waitlist'>Get started</Link>
      </Button>
    </div>
  );

  return (
    <HeroSection
      headline='Request Early Access'
      highlightText='handle'
      gradientVariant='primary'
      subtitle={defaultSubtitle}
      supportingText='Go live in 60 seconds • Free forever'
      trustIndicators={
        <p className='text-xs text-gray-400 dark:text-white/40 font-medium'>
          Trusted by 10,000+ artists worldwide
        </p>
      }
    >
      {content}
    </HeroSection>
  );
}
