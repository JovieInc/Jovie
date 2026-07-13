import { headers } from 'next/headers';
import { DashboardSegmentSkeleton } from '@/components/shell/DashboardSegmentSkeleton';
import { LyricsRouteSkeleton } from '@/components/shell/LyricsRouteSkeleton';
import { TasksRouteSkeleton } from '@/components/shell/TasksRouteSkeleton';
import ChatLoading from './chat/loading';
import { ReleaseTableSkeleton } from './dashboard/releases/loading';
import { LibraryLoadingState } from './library/LibrarySurface';
import {
  isChatShellRoute,
  isLibraryShellRoute,
  isLyricsShellRoute,
  isReleasesShellRoute,
  isTasksShellRoute,
  resolveAppShellRequestPath,
} from './shell-route-matches';

/**
 * Shell-level loading state shown during cross-section navigation
 * (e.g., dashboard -> settings, chat -> admin).
 *
 * Renders a minimal content skeleton that avoids layout shift while the
 * destination page and its data resolve. The shell (sidebar, header) persists
 * because they live in the parent layout — only the content area is replaced.
 */
export default async function ShellLoading() {
  const headerStore = await headers();
  const pathname = resolveAppShellRequestPath(
    headerStore.get('next-url'),
    headerStore.get('x-matched-path'),
    headerStore.get('x-invoke-path')
  );

  if (isChatShellRoute(pathname)) {
    return <ChatLoading />;
  }

  if (isReleasesShellRoute(pathname)) {
    return <ReleaseTableSkeleton showHeader={false} />;
  }

  if (isLibraryShellRoute(pathname)) {
    return <LibraryLoadingState />;
  }

  if (isLyricsShellRoute(pathname)) {
    return <LyricsRouteSkeleton />;
  }

  if (isTasksShellRoute(pathname)) {
    return <TasksRouteSkeleton />;
  }

  return <DashboardSegmentSkeleton rowKeyPrefix='shell-loading-row' />;
}
