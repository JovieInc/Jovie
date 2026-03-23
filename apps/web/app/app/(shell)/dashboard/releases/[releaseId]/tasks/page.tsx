import { eq } from 'drizzle-orm';
import { ReleaseTaskPage } from '@/components/features/dashboard/release-tasks';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';

interface TasksPageProps {
  readonly params: Promise<{ releaseId: string }>;
}

export default async function TasksPage({ params }: TasksPageProps) {
  const { releaseId } = await params;

  const [release] = await db
    .select({
      title: discogReleases.title,
      releaseDate: discogReleases.releaseDate,
    })
    .from(discogReleases)
    .where(eq(discogReleases.id, releaseId))
    .limit(1);

  return (
    <ReleaseTaskPage
      releaseId={releaseId}
      releaseTitle={release?.title ?? 'Release'}
      releaseDate={release?.releaseDate}
    />
  );
}
