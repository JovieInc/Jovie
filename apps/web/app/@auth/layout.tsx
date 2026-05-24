import { AuthModalShell } from '@/components/auth/AuthModalShell';
import { AuthClientProviders } from '@/components/providers/AuthClientProviders';
import { isMockPublishableKey } from '@/components/providers/clerkAvailability';
import { AuthUnavailableCard } from '@/features/auth';
import { resolvePublishableKeyStaticFirst } from '@/lib/auth/staging-clerk-keys';
import { publicEnv } from '@/lib/env-public';

/**
 * Layout for the `@auth` parallel slot.
 *
 * The intercepted signup modal at `(.)signup/page.tsx` needs the same
 * ClerkProvider the `(auth)/layout.tsx` provides for the full-page routes.
 * Without this layout the modal renders outside the Clerk context and
 * `<SignUp />` throws.
 *
 * Design mirrors `(auth)/layout.tsx`: publishable key resolved without calling
 * headers() on production so this layout does NOT opt marketing routes into
 * dynamic rendering. On staging/local resolvePublishableKeyStaticFirst() falls
 * back to the per-request header, which is fine (those envs are dynamic anyway).
 *
 * We intentionally do NOT use `export const dynamic = 'force-dynamic'` here —
 * this layout renders on every route including static marketing pages, and
 * force-dynamic would cause per-request nonce headers to be emitted for those
 * routes, violating the static-marketing rule (.claude/rules/ui.md, JOV-2040).
 *
 * We intentionally do NOT wrap in `<main>` here — the intercepted modal is
 * positioned over the page's existing `<main>`, and an extra landmark would
 * confuse a11y.
 */
export default async function AuthSlotLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const publishableKey = await resolvePublishableKeyStaticFirst();

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
