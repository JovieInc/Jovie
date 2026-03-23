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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
