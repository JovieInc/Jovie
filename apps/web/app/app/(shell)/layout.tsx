import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { redirect, unstable_rethrow } from 'next/navigation';
import { Suspense } from 'react';
import { AppShellSkeleton } from '@/components/organisms/AppShellSkeleton';
import { APP_ROUTES } from '@/constants/routes';
import { ErrorBanner } from '@/features/feedback/ErrorBanner';
import { buildAppShellSignInUrl } from '@/lib/auth/build-app-shell-signin-url';
import { getCachedAuth } from '@/lib/auth/cached';
import { getAppFlagValue } from '@/lib/flags/server';
import ChatLoading from './chat/loading';
import { DashboardShellContent } from './DashboardShellContent';
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

    // Resolve the shell variant up front so the Suspense fallback skeleton
    // matches the post-resolve AppShellFrame layout. Without this, flag-on
    // users would flash a 'legacy' skeleton then snap to the rounded
    // 'shellChatV1' frame once DashboardShellContent resolves.
    const shellChatV1 = await getAppFlagValue('SHELL_CHAT_V1', {
      userId: auth.userId,
    });
    const shellVariant = shellChatV1 ? 'shellChatV1' : 'legacy';

    let shellFallback: React.ReactNode;
    if (isChatShellRoute(pathname)) {
      shellFallback = (
        <AppShellSkeleton main={<ChatLoading />} variant={shellVariant} />
      );
    } else if (isReleasesShellRoute(pathname)) {
      shellFallback = (
        <AppShellSkeleton
          main={<ReleaseTableSkeleton showHeader={false} />}
          variant={shellVariant}
        />
      );
    } else {
      shellFallback = <AppShellSkeleton variant={shellVariant} />;
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
