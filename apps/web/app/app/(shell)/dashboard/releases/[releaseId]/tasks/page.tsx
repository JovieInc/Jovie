import { and, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { ReleaseTaskPage } from '@/components/features/dashboard/release-tasks';
import { ReleasePlanUpgradeInterstitial } from '@/components/features/dashboard/tasks/TasksUpgradeInterstitial';
import { APP_ROUTES } from '@/constants/routes';
import { getCurrentUserProfile } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

interface TasksPageProps {
  readonly params: Promise<{ releaseId: string }>;
}

export default async function TasksPage({ params }: TasksPageProps) {
  const { releaseId } = await params;

  return (
    <Suspense
      fallback={
        <div className='flex flex-1 items-center justify-center p-8'>
          <div className='h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent' />
        </div>
      }
    >
      <TasksContent releaseId={releaseId} />
    </Suspense>
  );
}

async function TasksContent({ releaseId }: Readonly<{ releaseId: string }>) {
  const profilePromise = getCurrentUserProfile();
  const entitlementsPromise = getCurrentUserEntitlements();
  const [profile, entitlements] = await Promise.all([
    profilePromise,
    entitlementsPromise,
  ]);
  const profileId = profile?.id;

  if (!profileId || !profile.onboardingCompletedAt) {
    redirect(APP_ROUTES.ONBOARDING);
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
