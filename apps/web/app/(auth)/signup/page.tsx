import { Suspense } from 'react';
import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';
import { SignUpPageClient } from './SignUpPageClient';

/**
 * Sign-up page using the canonical AuthShell (JOV-2064).
 *
 * The page and the intercepted modal route at `/@auth/(.)signup` render the
 * same AuthShell, so copy, links, and provider list cannot drift. Provider
 * buttons are gated by `lib/auth/oauth-providers.ts` — Apple stays hidden
 * until its env flag is set (JOV-2062).
 */
export default function SignUpPage() {
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <SignUpPageClient />
    </Suspense>
  );
}
