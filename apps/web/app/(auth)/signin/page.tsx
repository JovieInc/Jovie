'use client';

import { ClerkLoaded, ClerkLoading } from '@clerk/nextjs';
import { AuthLayout, AuthPageSkeleton, OtpSignInForm } from '@/components/auth';

export default function SignInPage() {
  return (
    <>
      <ClerkLoading>
        <AuthPageSkeleton
          formTitle="What's your email?"
          showFormTitle={false}
          showFooterPrompt={false}
        />
      </ClerkLoading>
      <ClerkLoaded>
        <AuthLayout
          formTitle="What's your email?"
          showFormTitle={false}
          showFooterPrompt={false}
        >
          <OtpSignInForm />
        </AuthLayout>
      </ClerkLoaded>
    </>
  );
}
