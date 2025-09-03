'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type JSX, useEffect } from 'react';

export default function SignInHyphenRedirect(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams?.toString();
    const url = qs ? `/signin?${qs}` : '/signin';
    router.replace(url);
  }, [router, searchParams]);

  return (
    <div className='flex min-h-screen items-center justify-center px-4'>
      <p className='text-sm text-secondary'>Redirecting to sign in…</p>
    </div>
  );
}
