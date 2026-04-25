'use client';

import { SignIn } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';
import { SignInTimeoutEscape } from '@/components/molecules/SignInTimeoutEscape';
import { APP_ROUTES } from '@/constants/routes';
import { AuthLayout, AuthRoutePrefetch } from '@/features/auth';
import { useNormalizeClerkHomeLink } from '@/features/auth/useNormalizeClerkHomeLink';
import { buildAuthRouteUrl } from '@/lib/auth/build-auth-route-url';

/**
 * Sign-in page using Clerk's prebuilt components for reliability.
 */
// Keep this validation lightweight for prefill only; extraction paths use stricter domain filtering.
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

function SignInPageContent() {
  const [isMounted, setIsMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const email = searchParams.get('email')?.trim() ?? '';
  const resetConfirmed = searchParams.get('reset') === '1';
  const initialValues = isValidEmail(email)
    ? { emailAddress: email }
    : undefined;
  const signUpUrl = buildAuthRouteUrl(APP_ROUTES.SIGNUP, searchParams);

  useNormalizeClerkHomeLink(containerRef);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (resetConfirmed) {
      toast.success('Session cleared. Please sign in again.', {
        id: 'auth-reset',
      });
    }
  }, [resetConfirmed]);

  if (!isMounted) {
    return (
      <>
        <AuthFormSkeleton />
        <SignInTimeoutEscape />
      </>
    );
  }

  return (
    <>
      <AuthRoutePrefetch href={APP_ROUTES.SIGNUP} />
      <div ref={containerRef}>
        <SignIn
          routing='hash'
          oauthFlow='redirect'
          signUpUrl={signUpUrl}
          fallbackRedirectUrl={APP_ROUTES.DASHBOARD}
          initialValues={initialValues}
        />
      </div>
      <SignInTimeoutEscape />
    </>
  );
}

export default function SignInPage() {
  return (
    <AuthLayout
      formTitle='Sign in'
      showFormTitle={false}
      showFooterPrompt={false}
      layoutVariant='split'
    >
      <Suspense fallback={<AuthFormSkeleton />}>
        <SignInPageContent />
      </Suspense>
    </AuthLayout>
  );
}
