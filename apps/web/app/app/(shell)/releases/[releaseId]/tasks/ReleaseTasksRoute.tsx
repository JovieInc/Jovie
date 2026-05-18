import { and, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { loadAppShellRouteContext } from '@/app/app/(shell)/app-shell-route-context';
import {
  ReleaseTaskPage,
  ReleaseTaskPageSkeleton,
} from '@/components/features/dashboard/release-tasks';
import { ReleasePlanUpgradeInterstitial } from '@/components/features/dashboard/tasks/TasksUpgradeInterstitial';
import { APP_ROUTES, buildReleaseTasksRoute } from '@/constants/routes';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

interface ReleaseTasksRouteProps {
  readonly params: Promise<{ releaseId: string }>;
}

export async function ReleaseTasksRoute({ params }: ReleaseTasksRouteProps) {
  const { releaseId } = await params;

  return (
    <Suspense fallback={<ReleaseTaskPageSkeleton />}>
      <ReleaseTasksContent releaseId={releaseId} />
    </Suspense>
  );
}

async function ReleaseTasksContent({
  releaseId,
}: Readonly<{ releaseId: string }>) {
  const route = buildReleaseTasksRoute(releaseId);
  const [routeContext, entitlements] = await Promise.all([
    loadAppShellRouteContext({
      route,
      dashboardErrorLogMessage:
        'Dashboard data load failed on release tasks page',
      dashboardErrorMessage:
        'Failed to load release task data. Please refresh the page.',
    }),
    getCurrentUserEntitlements(),
  ]);

  if (!routeContext.ok) {
    return routeContext.error;
  }

  const { profileId } = routeContext;
  if (!profileId) {
    redirect(APP_ROUTES.START);
  }

  const [release] = await db
    .select({
      title: discogReleases.title,
      releaseDate: discogReleases.releaseDate,
    })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.id, releaseId),
        eq(discogReleases.creatorProfileId, profileId)
      )
    )
    .limit(1);

  if (!release) {
    notFound();
  }

  if (!entitlements.canAccessTasksWorkspace) {
    return <ReleasePlanUpgradeInterstitial releaseTitle={release.title} />;
  }

  return (
    <ReleaseTaskPage
      profileId={profileId}
      releaseId={releaseId}
      releaseTitle={release.title ?? 'Release'}
      releaseDate={release.releaseDate}
      showMetadataAgentPanel={
        entitlements.isAdmin || entitlements.canAccessMetadataSubmissionAgent
      }
    />
  );
}
