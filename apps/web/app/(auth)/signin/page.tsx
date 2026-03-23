'use client';

import { SignIn } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { AuthLayout } from '@/features/auth';

/**
 * Sign-in page using Clerk's prebuilt components for reliability.
 */
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

function AuthRoutePrefetch({ href }: { href: string }) {
  const router = useRouter();

  useEffect(() => {
    router.prefetch(href);
  }, [href, router]);

  return null;
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
        signUpUrl={APP_ROUTES.SIGNUP}
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
