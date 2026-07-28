import { headers } from 'next/headers';
import { AppShellSkeleton } from '@/components/organisms/AppShellSkeleton';
import { TasksRouteSkeleton } from '@/components/shell/TasksRouteSkeleton';
import {
  APP_SHELL_MODE_HEADER,
  parseTrustedAppShellMode,
} from '@/lib/app-shell/mode';
import {
  isTasksShellRoute,
  resolveAppShellLoadingPath,
} from './(shell)/shell-route-matches';

/**
 * App root loading screen
 * Renders a skeleton of the full app shell (sidebar + header + content)
 * to prevent layout shift while the server layout and data resolve.
 */
export default async function AppLoading() {
  const headerStore = await headers();
  const mode = parseTrustedAppShellMode(headerStore.get(APP_SHELL_MODE_HEADER));
  const pathname = resolveAppShellLoadingPath(
    headerStore.get('next-url'),
    headerStore.get('x-matched-path'),
    headerStore.get('x-invoke-path')
  );

  return (
    <AppShellSkeleton
      main={isTasksShellRoute(pathname) ? <TasksRouteSkeleton /> : undefined}
      brandVariant={mode === 'ov' ? 'ov' : 'jovie'}
    />
  );
}
