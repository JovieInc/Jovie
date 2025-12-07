'use client';

import { ClerkLoaded, ClerkLoading } from '@clerk/nextjs';
import { AuthLayout, AuthPageSkeleton, OtpSignUpForm } from '@/components/auth';

export default function SignUpPage() {
  return (
    <AuthLayout
      formTitle='Create your account'
      footerPrompt='Already have an account?'
      footerLinkText='Log in'
      footerLinkHref='/signin'
    >
      <ClerkLoading>
        <AuthPageSkeleton
          formTitle='Create your account'
          footerPrompt='Already have an account?'
          footerLinkText='Log in'
          footerLinkHref='/signin'
        />
      </ClerkLoading>
      <ClerkLoaded>
        <OtpSignUpForm />
      </ClerkLoaded>
    </AuthLayout>
  );
}
