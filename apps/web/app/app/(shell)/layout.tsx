import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { redirect, unstable_rethrow } from 'next/navigation';
import { Suspense } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { ErrorBanner } from '@/features/feedback/ErrorBanner';
import { buildAppShellSignInUrl } from '@/lib/auth/build-app-shell-signin-url';
import { getCachedAuth } from '@/lib/auth/cached';
import ChatLoading from './chat/loading';
import { DashboardShellContent } from './DashboardShellContent';
import { DashboardShellSkeleton } from './DashboardShellSkeleton';
import { ReleaseTableSkeleton } from './dashboard/releases/loading';
import {
  isChatShellRoute,
  isReleasesShellRoute,
  resolveAppShellRequestPath,
} from './shell-route-matches';

export const runtime = 'nodejs';

export default async function AppShellLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  try {
    const headerStorePromise = headers();

    // Auth check is fast — reads JWT from request headers, cached via React cache().
    // Must run before Suspense so unauthenticated users redirect immediately
    // instead of seeing a dashboard skeleton flash.
    const auth = await getCachedAuth();
    const headerStore = await headerStorePromise;
    const nextUrlHeader = headerStore.get('next-url');
    const pathname = resolveAppShellRequestPath(
      nextUrlHeader,
      headerStore.get('x-matched-path'),
      headerStore.get('x-invoke-path')
    );

    if (!auth.userId) {
      redirect(buildAppShellSignInUrl(nextUrlHeader));
    }

    let shellFallback: React.ReactNode;
    if (isChatShellRoute(pathname)) {
      shellFallback = (
        <DashboardShellSkeleton>
          <ChatLoading />
        </DashboardShellSkeleton>
      );
    } else if (isReleasesShellRoute(pathname)) {
      shellFallback = (
        <DashboardShellSkeleton>
          <ReleaseTableSkeleton />
        </DashboardShellSkeleton>
      );
    } else {
      shellFallback = <DashboardShellSkeleton />;
    }

    // Ban check moved inside DashboardShellContent (runs in parallel with
    // shell data fetch). Banned users are 1-in-a-million — their experience
    // is not worth adding a blocking DB query to the critical path of every
    // dashboard page load for every user.

    // Stream the shell: the route-aware skeleton renders at first byte while
    // DashboardShellContent resolves dashboard data + feature flags.
    return (
      <Suspense fallback={shellFallback}>
        <DashboardShellContent userId={auth.userId} pathname={pathname}>
          {children}
        </DashboardShellContent>
      </Suspense>
    );
  } catch (error) {
    unstable_rethrow(error);

    Sentry.captureException(error);

    // SAFETY: Error UI is self-contained - DO NOT render {children} here
    // as it would break context provider expectations (DashboardDataProvider, etc.)
    return (
      <div className='min-h-screen bg-base flex items-center justify-center px-6'>
        <div className='w-full max-w-lg space-y-4'>
          <ErrorBanner
            title='Dashboard failed to load'
            description='We could not load your workspace data. Refresh to try again or return to your profile.'
            actions={[
              { label: 'Retry', href: APP_ROUTES.DASHBOARD },
              { label: 'Go to my profile', href: '/' },
            ]}
            testId='dashboard-error'
          />
          <p className='text-sm text-secondary-token text-center'>
            If this keeps happening, please reach out to support so we can help
            restore access.
          </p>
        </div>
      </div>
    );
  }
}
