import { ReleaseTaskPage } from '@/components/features/dashboard/release-tasks';

interface TasksPageProps {
  readonly params: Promise<{ releaseId: string }>;
}

export default async function TasksPage({ params }: TasksPageProps) {
  const { releaseId } = await params;

  return <ReleaseTaskPage releaseId={releaseId} releaseTitle='Release' />;
}
