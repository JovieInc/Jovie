'use client';

import { ClerkLoaded, ClerkLoading } from '@clerk/nextjs';
import { AuthLayout, AuthPageSkeleton, OtpSignUpForm } from '@/components/auth';

export default function SignUpPage() {
  return (
    <>
      <ClerkLoading>
        <AuthPageSkeleton
          formTitle='Create your account'
          footerPrompt='Already have an account?'
          footerLinkText='Log in'
          footerLinkHref='/signin'
          showLegalLinks
        />
      </ClerkLoading>
      <ClerkLoaded>
        <AuthLayout
          formTitle='Create your account'
          footerPrompt='Already have an account?'
          footerLinkText='Log in'
          footerLinkHref='/signin'
          showLegalLinks
        >
          <OtpSignUpForm />
        </AuthLayout>
      </ClerkLoaded>
    </>
  );
}
