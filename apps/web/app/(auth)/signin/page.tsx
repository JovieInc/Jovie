'use client';

import { SignIn } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { AuthLayout, AuthRoutePrefetch } from '@/features/auth';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';

/**
 * Sign-in page using Clerk's prebuilt components for reliability.
 */
// Keep this lightweight for client-side prefill only; lib/email/extraction.ts
// handles richer extraction cases and pulls parsing helpers this page does not need.
function isValidEmail(value: string): boolean {
  if (value.length === 0 || value.length > 254) return false;

  const atIndex = value.indexOf('@');
  if (atIndex <= 0 || atIndex !== value.lastIndexOf('@')) return false;

  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);

  if (local.length > 64 || domain.length < 3) return false;
  if (domain.startsWith('.') || domain.endsWith('.') || !domain.includes('.')) {
    return false;
  }

  for (const char of value) {
    if (char <= ' ') return false;
  }

  for (const char of domain) {
    const isAlphaNumeric =
      (char >= 'a' && char <= 'z') ||
      (char >= 'A' && char <= 'Z') ||
      (char >= '0' && char <= '9');

    if (!(isAlphaNumeric || char === '.' || char === '-')) {
      return false;
    }
  }

  return true;
}

function buildSignUpUrl(searchParams: { get: (key: string) => string | null }) {
  const signUpUrl = new URL(APP_ROUTES.SIGNUP, globalThis.location.origin);
  const redirectUrl = sanitizeRedirectUrl(searchParams.get('redirect_url'));

  if (redirectUrl) {
    signUpUrl.searchParams.set('redirect_url', redirectUrl);
  }

  return signUpUrl.pathname + signUpUrl.search;
}

function SignInPageContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email')?.trim() ?? '';
  const initialValues = isValidEmail(email)
    ? { emailAddress: email }
    : undefined;

  return (
    <>
      <AuthRoutePrefetch href={APP_ROUTES.SIGNUP} />
      <SignIn
        routing='hash'
        oauthFlow='redirect'
        signUpUrl={buildSignUpUrl(searchParams)}
        fallbackRedirectUrl={APP_ROUTES.DASHBOARD}
        initialValues={initialValues}
      />
    </>
  );
}

export default function SignInPage() {
  return (
    <AuthLayout
      formTitle='Sign in'
      showFormTitle={false}
      showFooterPrompt={false}
    >
      <Suspense fallback={null}>
        <SignInPageContent />
      </Suspense>
    </AuthLayout>
  );
}
