'use client';

import { SignIn } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { Logo } from '@/components/ui/Logo';

export default function SignInPage() {
  const searchParams = useSearchParams();

  // Check for redirect_url parameter (e.g., from protected pages like /onboarding)
  const redirectUrl = searchParams?.get('redirect_url') ?? null;

  // Check for artistId parameter (legacy flow)
  const artistId = searchParams?.get('artistId') ?? null;

  // Determine destination: prioritize redirect_url, then artistId flow, then default to dashboard
  const destination =
    redirectUrl ||
    (artistId ? `/dashboard?artistId=${artistId}` : '/dashboard');

  return (
    <div className='flex min-h-screen items-center justify-center bg-white dark:bg-[#0D0E12] transition-colors px-4'>
      <div className='w-full max-w-md mx-auto'>
        <div className='text-center mb-8'>
          <Logo size='lg' className='mx-auto mb-4' />
          <h1 className='text-2xl font-semibold text-gray-900 dark:text-white mb-2'>
            Sign in to your account
          </h1>
          <p className='text-gray-600 dark:text-white/70'>Welcome back.</p>
          <p className='mt-4 text-sm text-gray-600 dark:text-white/70'>
            By signing in, you agree to our{' '}
            <a
              href='/legal/terms'
              target='_blank'
              rel='noopener noreferrer'
              className='font-medium text-blue-600 hover:text-blue-700 underline dark:text-blue-400 dark:hover:text-blue-300'
            >
              Terms of Service
            </a>{' '}
            and{' '}
            <a
              href='/legal/privacy'
              target='_blank'
              rel='noopener noreferrer'
              className='font-medium text-blue-600 hover:text-blue-700 underline dark:text-blue-400 dark:hover:text-blue-300'
            >
              Privacy Policy
            </a>
            .
          </p>
        </div>
        <SignIn
          redirectUrl={destination}
          afterSignInUrl={destination}
          afterSignUpUrl={destination}
        />
      </div>
    </div>
  );
}
