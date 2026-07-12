import { headers } from 'next/headers';
import { AudienceTableLoadingShell } from '@/components/features/dashboard/organisms/dashboard-audience-table/AudienceTableLoadingShell';
import { DashboardSegmentSkeleton } from '@/components/shell/DashboardSegmentSkeleton';
import { LyricsRouteSkeleton } from '@/components/shell/LyricsRouteSkeleton';
import { TasksRouteSkeleton } from '@/components/shell/TasksRouteSkeleton';
import AdminLoading from './admin/loading';
import { CalendarRouteSkeleton } from './calendar/LazyCalendarPageClient';
import ChatLoading from './chat/loading';
import PresenceLoading from './dashboard/presence/loading';
import { ReleaseTableSkeleton } from './dashboard/releases/loading';
import InsightsLoading from './insights/loading';
import { LibraryLoadingState } from './library/LibrarySurface';
import SettingsLoading from './settings/loading';
import {
  isAdminShellRoute,
  isAudienceShellRoute,
  isCalendarShellRoute,
  isChatShellRoute,
  isInsightsShellRoute,
  isLibraryShellRoute,
  isLyricsShellRoute,
  isPresenceShellRoute,
  isReleasesShellRoute,
  isSettingsShellRoute,
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

  if (isSettingsShellRoute(pathname)) {
    return <SettingsLoading />;
  }

  if (isPresenceShellRoute(pathname)) {
    return <PresenceLoading />;
  }

  if (isAudienceShellRoute(pathname)) {
    return <AudienceTableLoadingShell />;
  }

  if (isCalendarShellRoute(pathname)) {
    return <CalendarRouteSkeleton />;
  }

  if (isInsightsShellRoute(pathname)) {
    return <InsightsLoading />;
  }

  if (isAdminShellRoute(pathname)) {
    return <AdminLoading />;
  }

  return <DashboardSegmentSkeleton rowKeyPrefix='shell-loading-row' />;
}
