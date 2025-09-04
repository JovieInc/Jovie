'use client';

import { ClerkLoaded, ClerkLoading, SignUp } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/auth';
import { AuthFormSkeleton } from '@/components/ui/LoadingSkeleton';
import { getInlineClerkAppearance } from '@/lib/auth/clerk-theme';

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
            appearance={getInlineClerkAppearance()}
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
