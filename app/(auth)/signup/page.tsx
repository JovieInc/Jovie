'use client';

import { ClerkLoaded, ClerkLoading, SignUp } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/auth';
import { AuthFormSkeleton } from '@/components/ui/LoadingSkeleton';

export default function SignUpPage() {
  const searchParams = useSearchParams();
  const redirectUrl = searchParams?.get('redirect_url') || '/dashboard';

  return (
    <AuthLayout
      brandingTitle='Join Jovie today'
      brandingDescription='Create your profile in minutes and start sharing your story with a beautiful, conversion-optimized page.'
      formTitle='Create your account'
      gradientFrom='purple-600'
      gradientVia='cyan-600'
      gradientTo='blue-600'
      textColorClass='text-purple-100'
    >
      <div className='min-h-[500px]'>
        <ClerkLoading>
          <AuthFormSkeleton />
        </ClerkLoading>
        <ClerkLoaded>
          <SignUp
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
                  'border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 focus:border-purple-500',
                formButtonPrimary:
                  'bg-purple-600 hover:bg-purple-500 text-white font-medium py-2.5 rounded-lg transition-colors',
                footerActionLink:
                  'text-purple-600 hover:text-purple-500 font-medium',
              },
            }}
            routing='hash'
            redirectUrl={redirectUrl}
            afterSignUpUrl={redirectUrl}
            signInUrl='/signin'
          />
        </ClerkLoaded>
      </div>
    </AuthLayout>
  );
}
