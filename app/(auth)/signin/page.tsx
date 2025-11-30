'use client';

import { ClerkLoaded, ClerkLoading } from '@clerk/nextjs';
import { AuthLayout } from '@/components/auth';
import { OtpSignInForm } from '@/components/auth/OtpSignInForm';
import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';

export default function SignInPage() {
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
          <OtpSignInForm />
        </ClerkLoaded>
      </div>
    </AuthLayout>
  );
}
