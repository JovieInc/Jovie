'use client';

import { AuthLayout, SignInForm } from '@/components/auth';

/**
 * Sign-in page using new Clerk Core API implementation.
 * No longer depends on Clerk Elements.
 */
export default function SignInPage() {
  return (
    <AuthLayout
      formTitle="What's your email?"
      showFormTitle={false}
      footerPrompt="Don't have an account?"
      footerLinkText='Sign up'
      footerLinkHref='/signup'
    >
      <SignInForm />
    </AuthLayout>
  );
}
