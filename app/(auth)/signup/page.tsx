'use client';

import { ClerkLoaded, ClerkLoading } from '@clerk/nextjs';
import { AuthLayout, OtpSignUpForm } from '@/components/auth';
import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';

export default function SignUpPage() {
  return (
    <AuthLayout
      formTitle='Create your account'
      gradientVariant='purple-cyan-blue'
      textColorClass='text-purple-100'
    >
      <ClerkLoading>
        <AuthFormSkeleton />
      </ClerkLoading>
      <ClerkLoaded>
        <OtpSignUpForm />
      </ClerkLoaded>
    </AuthLayout>
  );
}
