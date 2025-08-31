'use client';

import { ClerkLoaded, ClerkLoading, SignIn } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import React from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { AuthLayout } from '@/components/auth';

class SignInErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className='mt-4 text-center text-sm text-red-600 dark:text-red-400'>
          Sign in failed. Please try again.
        </div>
      );
    }

    return this.props.children;
  }
}

export default function SignInPage() {
  const searchParams = useSearchParams();
  const redirectUrl = searchParams?.get('redirect_url') || '/dashboard';

  return (
    <AuthLayout
      brandingTitle='Welcome back to Jovie'
      brandingDescription='Sign in to manage your profile, track your analytics, and share your story with the world.'
      formTitle='Sign in to Jovie'
      gradientFrom='blue-600'
      gradientVia='purple-600'
      gradientTo='cyan-600'
      textColorClass='text-blue-100'
    >
      <ClerkLoading>
        <div className='flex justify-center py-8' data-testid='spinner'>
          <LoadingSpinner size='lg' />
        </div>
      </ClerkLoading>
      <ClerkLoaded>
        <SignInErrorBoundary>
          <SignIn
            appearance={{
              elements: {
                rootBox: 'mx-auto w-full',
                card: 'shadow-none border-0 bg-transparent p-0',
                headerTitle:
                  'hidden lg:block text-2xl font-bold text-gray-900 dark:text-white mb-6',
                headerSubtitle:
                  'hidden lg:block text-gray-600 dark:text-gray-300 mb-8',
                socialButtonsBlockButton:
                  'border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors',
                dividerLine: 'bg-gray-200 dark:bg-gray-700',
                dividerText: 'text-gray-500 dark:text-gray-400',
                formFieldInput:
                  'border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                formButtonPrimary:
                  'bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-lg transition-colors',
                footerActionLink:
                  'text-blue-600 hover:text-blue-500 font-medium',
              },
            }}
            redirectUrl={redirectUrl}
            signUpUrl='/signup'
          />
        </SignInErrorBoundary>
      </ClerkLoaded>
    </AuthLayout>
  );
}
