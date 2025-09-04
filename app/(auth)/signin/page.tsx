'use client';

import { ClerkLoaded, ClerkLoading, SignIn } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/auth';
import { AuthFormSkeleton } from '@/components/ui/LoadingSkeleton';
import { getInlineClerkAppearance } from '@/lib/auth/clerk-theme';

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
      <div className='min-h-[400px]'>
        <ClerkLoading>
          <AuthFormSkeleton />
        </ClerkLoading>
        <ClerkLoaded>
          <SignIn
            appearance={getInlineClerkAppearance()}
            routing='hash'
            redirectUrl={redirectUrl}
            afterSignInUrl={redirectUrl}
            afterSignUpUrl={redirectUrl}
            signUpUrl='/signup'
          />
        </ClerkLoaded>
      </div>
    </AuthLayout>
  );
}
