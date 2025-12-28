'use client';

import { AuthLayout, SignUpForm } from '@/components/auth';

/**
 * Sign-up page using new Clerk Core API implementation.
 * No longer depends on Clerk Elements.
 */
export default function SignUpPage() {
  return (
    <AuthLayout
      formTitle='Create your account'
      footerPrompt='Already have an account?'
      footerLinkText='Log in'
      footerLinkHref='/signin'
      showLegalLinks
    >
      <SignUpForm />
    </AuthLayout>
  );
}
