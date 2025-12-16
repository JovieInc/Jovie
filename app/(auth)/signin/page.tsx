'use client';

import { ClerkLoaded, ClerkLoading } from '@clerk/nextjs';
import { AuthLayout, AuthPageSkeleton, OtpSignInForm } from '@/components/auth';

export default function SignInPage() {
  return (
    <>
      <ClerkLoading>
        <AuthPageSkeleton
          formTitle="What's your email address?"
          formTitleClassName='text-lg font-medium text-[rgb(227,228,230)] mb-4'
          showFormTitle={false}
          showFooterPrompt={false}
        />
      </ClerkLoading>
      <ClerkLoaded>
        <AuthLayout
          formTitle="What's your email address?"
          formTitleClassName='text-lg font-medium text-[rgb(227,228,230)] mb-4'
          showFormTitle={false}
          showFooterPrompt={false}
        >
          <OtpSignInForm />
        </AuthLayout>
      </ClerkLoaded>
    </>
  );
}
