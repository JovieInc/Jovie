import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { APP_ROUTES } from '@/constants/routes';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  // getCurrentUserEntitlements degrades gracefully on billing failure --
  // admin status is fetched independently and preserved even when billing is down.
  const entitlements = await getCurrentUserEntitlements();

  // Redirect unauthorized users to dashboard. Middleware already gates /app/admin
  // as a protected path, so unauthenticated users never reach this layout.
  // If auth state is transiently unavailable, redirecting to /sign-in would loop
  // (middleware redirects authed users back). Dashboard is the safe fallback.
  if (
    !entitlements.isAuthenticated ||
    !entitlements.userId ||
    !entitlements.isAdmin
  ) {
    redirect(APP_ROUTES.DASHBOARD);
  }

  // Wrap admin subtree in QueryProvider so any descendant <HydrationBoundary>
  // (e.g. the (shell) HydrateClient rendered for SSR prefetch on routes like
  // /app/admin/waitlist) always has a QueryClient context available, even if
  // the upstream providers chain is missing one. Fixes JOVIE-WEB-A6 /
  // JOVIE-WEB-A7: "No QueryClient set, use QueryClientProvider to set one".
  return <QueryProvider>{children}</QueryProvider>;
}
