'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { memo, type ReactNode } from 'react';
import { FEATURE_FLAGS, useFeatureFlagWithLoading } from '@/lib/analytics';
import { ClaimHandleForm } from './ClaimHandleForm';

function LoadingSkeleton() {
  return (
    <div className='flex flex-col items-center gap-4'>
      <div className='animate-pulse motion-reduce:animate-none'>
        <div className='h-4 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-4' />
        <div className='h-10 bg-gray-200 dark:bg-gray-700 rounded w-full' />
      </div>
    </div>
  );
}

function GetStartedContent() {
  return (
    <div className='flex flex-col items-center gap-4'>
      <p className='text-sm text-gray-600 dark:text-white/70'>
        Create your artist page in seconds.
      </p>
      <Button asChild size='lg' data-test='signup-btn'>
        <Link href='/waitlist'>Get started</Link>
      </Button>
    </div>
  );
}

function getHeroContent(loading: boolean, showClaimHandle: boolean): ReactNode {
  if (loading) return <LoadingSkeleton />;
  if (showClaimHandle) return <ClaimHandleForm />;
  return <GetStartedContent />;
}

export const HomeHeroContent = memo(function HomeHeroContent() {
  const { enabled: showClaimHandle, loading } = useFeatureFlagWithLoading(
    FEATURE_FLAGS.CLAIM_HANDLE,
    false
  );

  return getHeroContent(loading, showClaimHandle);
});
