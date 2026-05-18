'use client';

import ErrorBoundary from '@/components/organisms/ErrorBoundary';
import { AuthUnavailableCard } from '@/features/auth';
import type { ErrorProps } from '@/types/common';

/**
 * Returns true when the error looks like an auth-service failure —
 * i.e., Clerk is unavailable, not a product-logic error in the page.
 */
function isAuthDegradedError(error: Error): boolean {
  const msg = error.message?.toLowerCase() ?? '';
  const name = error.constructor?.name?.toLowerCase() ?? '';
  return (
    msg.includes('clerk') ||
    msg.includes('publishable key') ||
    msg.includes('auth') ||
    name.includes('clerkerror') ||
    // Next.js CLERK_ENCRYPTION_KEY / missing env errors surface like this
    msg.includes('encryption') ||
    // The proxy 503 can propagate as a fetch error in RSC
    msg.includes('service temporarily unavailable') ||
    msg.includes('503')
  );
}

export default function WaitlistError({ error, reset }: ErrorProps) {
  if (isAuthDegradedError(error)) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-[#06070a] px-5 py-8'>
        <AuthUnavailableCard />
      </div>
    );
  }
  return <ErrorBoundary error={error} reset={reset} context='Waitlist' />;
}
