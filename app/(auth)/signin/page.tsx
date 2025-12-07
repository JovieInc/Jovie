'use client';

import { ClerkLoaded, ClerkLoading } from '@clerk/nextjs';
import { AuthLayout, OtpSignInForm } from '@/components/auth';
import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';

export default function SignInPage() {
  return (
    <AuthLayout
      brandingTitle='Welcome back to Jovie'
      brandingDescription='Sign in to manage your profile, track your analytics, and share your story with the world.'
      formTitle='Sign in to Jovie'
      gradientVariant='blue-purple-cyan'
      textColorClass='text-blue-100'
    >
      <div className='min-h-[400px]'>
        <ClerkLoading>
          <AuthFormSkeleton />
        </ClerkLoading>
        <ClerkLoaded>
          <OtpSignInForm />
        </ClerkLoaded>
      </div>
    </AuthLayout>
  );
}
