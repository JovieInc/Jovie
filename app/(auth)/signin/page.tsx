'use client';

import { ClerkLoaded, ClerkLoading } from '@clerk/nextjs';
import { AuthLayout, OtpSignInForm } from '@/components/auth';
import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';

export default function SignInPage() {
  return (
    <AuthLayout formTitle='Log in to Jovie' footerPrompt='' footerLinkText=''>
      <ClerkLoading>
        <AuthFormSkeleton />
      </ClerkLoading>
      <ClerkLoaded>
        <OtpSignInForm />
      </ClerkLoaded>
    </AuthLayout>
  );
}
