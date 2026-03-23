import { and, eq } from 'drizzle-orm';
import { ReleaseTaskPage } from '@/components/features/dashboard/release-tasks';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { requireProfileId } from '../../task-actions';

interface TasksPageProps {
  readonly params: Promise<{ releaseId: string }>;
}

export default async function TasksPage({ params }: TasksPageProps) {
  const { releaseId } = await params;
  const profileId = await requireProfileId();

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

  return (
    <ReleaseTaskPage
      releaseId={releaseId}
      releaseTitle={release?.title ?? 'Release'}
      releaseDate={release?.releaseDate}
    />
  );
}
