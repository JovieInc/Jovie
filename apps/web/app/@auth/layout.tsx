import { headers } from 'next/headers';
import { AuthModalShell } from '@/components/auth/AuthModalShell';
import { AuthClientProviders } from '@/components/providers/AuthClientProviders';
import { isMockPublishableKey } from '@/components/providers/clerkAvailability';
import { AuthUnavailableCard } from '@/features/auth';
import { resolvePublishableKeyFromHeaders } from '@/lib/auth/staging-clerk-keys';
import { publicEnv } from '@/lib/env-public';

export const dynamic = 'force-dynamic';

/**
 * Layout for the `@auth` parallel slot.
 *
 * The intercepted signup modal at `(.)signup/page.tsx` needs the same
 * ClerkProvider the `(auth)/layout.tsx` provides for the full-page routes.
 * Without this layout the modal renders outside the Clerk context and
 * `<SignUp />` throws.
 *
 * Design mirrors `(auth)/layout.tsx`: publishable key resolved from headers,
 * mock detection, fallback card on unavailable Clerk. We intentionally do
 * NOT wrap in `<main>` here — the intercepted modal is positioned over the
 * page's existing `<main>`, and an extra landmark would confuse a11y.
 */
export default async function AuthSlotLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const publishableKey = await resolvePublishableKeyFromHeaders();
  await headers();

  const isClerkUnavailable =
    !publishableKey ||
    publicEnv.NEXT_PUBLIC_CLERK_MOCK === '1' ||
    isMockPublishableKey(publishableKey);

  if (isClerkUnavailable) {
    // Wrap the fallback card in the same modal shell the real flow uses, so
    // dev (Clerk mock) and prod both show a modal. Without this, the card
    // rendered in flow below the homepage and looked like a layout bug.
    return (
      <AuthModalShell ariaLabel='Authentication unavailable'>
        <AuthUnavailableCard />
      </AuthModalShell>
    );
  }

  return (
    <AuthClientProviders forceEnableClerk publishableKey={publishableKey}>
      {children}
    </AuthClientProviders>
  );
}
