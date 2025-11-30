'use client';

import { ClerkLoaded, ClerkLoading } from '@clerk/nextjs';
import { AuthLayout } from '@/components/auth';
import { OtpSignUpForm } from '@/components/auth/OtpSignUpForm';
import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';

export default function SignUpPage() {
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
          <OtpSignUpForm />
        </ClerkLoaded>
      </div>
    </AuthLayout>
  );
}
