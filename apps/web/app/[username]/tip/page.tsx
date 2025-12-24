'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { STATSIG_FLAGS } from '@/lib/flags';
import { useFeatureGate } from '@/lib/flags/client';

interface Props {
  params: Promise<{
    username: string;
  }>;
}

export default function TipPage({ params }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tippingGate = useFeatureGate(STATSIG_FLAGS.TIPPING);

  useEffect(() => {
    // Get the username from params and redirect
    params.then(({ username }) => {
      if (tippingGate.value) {
        const source = searchParams?.get('source');
        const sourceParam = source
          ? `&source=${encodeURIComponent(source)}`
          : '';
        router.replace(`/${username}?mode=tip${sourceParam}`);
      } else {
        router.replace(`/${username}`);
      }
    });
  }, [params, router, tippingGate.value, searchParams]);

  // Show loading while redirecting
  return (
    <div className='flex items-center justify-center min-h-screen'>
      <div className='text-center'>
        <div className='animate-spin motion-reduce:animate-none rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white mx-auto mb-4'></div>
        <p className='text-gray-600 dark:text-gray-400'>Redirecting...</p>
      </div>
    </div>
  );
}
