'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

interface Props {
  params: Promise<{
    username: string;
  }>;
}

export default function TipPage({ params }: Readonly<Props>) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Get the username from params and redirect
    params.then(({ username }) => {
      const source = searchParams?.get('source');
      const sourceParam = source ? `&source=${encodeURIComponent(source)}` : '';
      router.replace(`/${username}?mode=tip${sourceParam}`);
    });
  }, [params, router, searchParams]);

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
