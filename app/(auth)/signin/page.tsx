'use client';

import { ClerkLoaded, ClerkLoading } from '@clerk/nextjs';
import { AuthLayout, AuthPageSkeleton, OtpSignInForm } from '@/components/auth';

export default function SignInPage() {
  return (
    <>
      <ClerkLoading>
        <AuthPageSkeleton formTitle='Log in to Jovie' />
      </ClerkLoading>
      <ClerkLoaded>
        <AuthLayout formTitle='Log in to Jovie'>
          <OtpSignInForm />
        </AuthLayout>
      </ClerkLoaded>
    </>
  );
}
