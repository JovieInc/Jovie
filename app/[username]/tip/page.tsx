'use client';

import { useFeatureGate } from '@statsig/react-bindings';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';

interface Props {
  params: Promise<{
    username: string;
  }>;
}

export default function TipPage({ params }: Props) {
  const router = useRouter();
  const tippingGate = useFeatureGate(STATSIG_FLAGS.TIPPING);

  useEffect(() => {
    // Get the username from params and redirect
    params.then(({ username }) => {
      if (tippingGate.value) {
        router.replace(`/${username}?mode=tip`);
      } else {
        router.replace(`/${username}`);
      }
    });
  }, [params, router, tippingGate.value]);

  // Show loading while redirecting
  return (
    <div className='flex items-center justify-center min-h-screen'>
      <div className='text-center'>
        <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white mx-auto mb-4'></div>
        <p className='text-gray-600 dark:text-gray-400'>Redirecting...</p>
      </div>
    </div>
  );
}
