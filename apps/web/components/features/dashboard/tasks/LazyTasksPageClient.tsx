'use client';

import dynamic from 'next/dynamic';
import { TasksRouteSkeleton } from '@/components/shell/TasksRouteSkeleton';

const TasksPageClient = dynamic(
  () =>
    import('./TasksPageClient').then(mod => ({
      default: mod.TasksPageClient,
    })),
  {
    loading: () => <TasksRouteSkeleton />,
  }
);

export function LazyTasksPageClient() {
  return <TasksPageClient />;
}
