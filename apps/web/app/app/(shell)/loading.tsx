import { headers } from 'next/headers';
import { AudienceTableLoadingShell } from '@/components/features/dashboard/organisms/dashboard-audience-table/AudienceTableLoadingShell';
import { PageShell } from '@/components/organisms/PageShell';
import { DashboardSegmentSkeleton } from '@/components/shell/DashboardSegmentSkeleton';
import { LyricsRouteSkeleton } from '@/components/shell/LyricsRouteSkeleton';
import { TasksRouteSkeleton } from '@/components/shell/TasksRouteSkeleton';
import { CalendarRouteSkeleton } from './calendar/LazyCalendarPageClient';
import ChatLoading from './chat/loading';
import { ReleaseTableSkeleton } from './dashboard/releases/loading';
import { LibraryLoadingState } from './library/LibrarySurface';
import SettingsLoading from './settings/loading';
import {
  isAudienceShellRoute,
  isCalendarShellRoute,
  isChatShellRoute,
  isLibraryShellRoute,
  isLyricsShellRoute,
  isPresenceShellRoute,
  isReleasesShellRoute,
  isSettingsShellRoute,
  isTasksShellRoute,
  resolveAppShellRequestPath,
} from './shell-route-matches';

function SettingsShellLoading() {
  return (
    <PageShell
      maxWidth='wide'
      frame='none'
      contentPadding='none'
      scroll='page'
      surfaceClassName='pb-10'
      data-testid='settings-route-skeleton'
    >
      <div className='flex items-start gap-8'>
        <div aria-hidden className='w-52 shrink-0 max-md:hidden' />
        <div className='min-w-0 max-w-(--app-shell-content-max-form) flex-1'>
          <SettingsLoading />
        </div>
      </div>
    </PageShell>
  );
}

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
    return <SettingsShellLoading />;
  }

  if (isPresenceShellRoute(pathname)) {
    return <SettingsShellLoading />;
  }

  if (isAudienceShellRoute(pathname)) {
    return <AudienceTableLoadingShell />;
  }

  if (isCalendarShellRoute(pathname)) {
    return <CalendarRouteSkeleton />;
  }

  return <DashboardSegmentSkeleton rowKeyPrefix='shell-loading-row' />;
}
