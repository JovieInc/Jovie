import type { Metadata } from 'next';
import { AuthClientProviders } from '@/components/providers/AuthClientProviders';
import { AppFlagProvider } from '@/lib/flags/client';
import { resolveAuthRouteFlagNames } from '@/lib/flags/route-snapshots';
import { getAppFlagsSnapshot } from '@/lib/flags/server';

export const dynamic = 'force-dynamic';

// Auth routes must never be indexed — duplicate signup/signin pages hurt SEO
// and the flows carry state that search crawlers shouldn't surface.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Auth layout (Clerk → Better Auth migration, client-flip commit ⑦).
 *
 * Under Clerk this layout resolved the publishable key, gated on
 * `isMockPublishableKey`, and rendered an `AuthUnavailableCard` when Clerk
 * was misconfigured. Under Better Auth there is no provider to mount and
 * no publishable key to resolve — `AuthClientProviders` mounts the
 * `JovieAuthValuesProvider` (aliased as `ClerkSafeValuesProvider`) and
 * the auth pages render their own `auth.api.getSession` check directly
 * (audit row 16 — auth-page signed-in redirects live in the pages, not
 * the proxy).
 *
 * The `AuthUnavailableCard` trigger is retired (plan design row 21): there
 * is no Clerk config to be missing. A generic auth error boundary stays
 * in the `error.tsx` sibling.
 */
export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialFlags = await getAppFlagsSnapshot({
    flagNames: resolveAuthRouteFlagNames(),
  });

  return (
    <AuthClientProviders>
      <AppFlagProvider initialFlags={initialFlags}>
        <main id='main-content'>{children}</main>
      </AppFlagProvider>
    </AuthClientProviders>
  );
}
