import { and, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import {
  ReleaseTaskPage,
  ReleaseTaskPageSkeleton,
} from '@/components/features/dashboard/release-tasks';
import { ReleasePlanUpgradeInterstitial } from '@/components/features/dashboard/tasks/TasksUpgradeInterstitial';
import { APP_ROUTES } from '@/constants/routes';
import { getCurrentUserProfile } from '@/lib/auth/session';
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
  const profilePromise = getCurrentUserProfile();
  const entitlementsPromise = getCurrentUserEntitlements();
  const [profile, entitlements] = await Promise.all([
    profilePromise,
    entitlementsPromise,
  ]);
  const profileId = profile?.id;

  if (!profileId || !profile.onboardingCompletedAt) {
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
