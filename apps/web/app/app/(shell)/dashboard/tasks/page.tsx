import { TasksPageClient } from '@/components/features/dashboard/tasks/TasksPageClient';
import { TasksWorkspaceUpgradeInterstitial } from '@/components/features/dashboard/tasks/TasksUpgradeInterstitial';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export default async function TasksPage() {
  const entitlements = await getCurrentUserEntitlements();

  if (!entitlements.canAccessTasksWorkspace) {
    return <TasksWorkspaceUpgradeInterstitial />;
  }

  return <TasksPageClient />;
}
