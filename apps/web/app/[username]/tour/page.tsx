'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { getProfileModeHref } from '@/components/profile/registry';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
}

export default function TourPage({ params }: Readonly<Props>) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    params.then(({ username }) => {
      const source = searchParams?.get('source');
      const sourceParam = source ? `&source=${encodeURIComponent(source)}` : '';
      router.replace(getProfileModeHref(username, 'tour', sourceParam));
    });
  }, [params, router, searchParams]);

  return (
    <div className='flex min-h-screen items-center justify-center'>
      <div className='text-center'>
        <div className='mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900 motion-reduce:animate-none dark:border-white' />
        <p className='text-gray-600 dark:text-gray-400'>Redirecting...</p>
      </div>
    </div>
  );
}
