'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';
import { SignInTimeoutEscape } from '@/components/molecules/SignInTimeoutEscape';
import { APP_ROUTES } from '@/constants/routes';
import { AuthLayout, AuthRoutePrefetch, AuthShell } from '@/features/auth';

/**
 * Sign-in page using the canonical AuthShell (JOV-2064).
 *
 * Both the full-page route and the intercepted modal route render the same
 * AuthShell content model, so the typography, links, and provider list stay
 * in lockstep. Provider buttons are gated by `lib/auth/oauth-providers.ts`.
 */

// Keep this validation lightweight for prefill only; extraction paths use
// stricter domain filtering.
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
  const searchParams = useSearchParams();
  const email = searchParams.get('email')?.trim() ?? '';
  const resetConfirmed = searchParams.get('reset') === '1';
  const initialValues = useMemo(
    () => (isValidEmail(email) ? { emailAddress: email } : undefined),
    [email]
  );

  useEffect(() => {
    if (resetConfirmed) {
      toast.success('Session cleared. Please sign in again.', {
        id: 'auth-reset',
      });
    }
  }, [resetConfirmed]);

  return (
    <>
      <AuthRoutePrefetch href={APP_ROUTES.SIGNUP} />
      <AuthShell mode='sign-in' initialValues={initialValues} />
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
