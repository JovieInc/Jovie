import type { ReactNode } from 'react';
import { LyricsRouteSkeleton } from '@/components/shell/LyricsRouteSkeleton';
import { TasksRouteSkeleton } from '@/components/shell/TasksRouteSkeleton';
import { CalendarRouteSkeleton } from './calendar/CalendarRouteSkeleton';
import ChatLoading from './chat/ChatLoadingState';
import { LinksRouteSkeleton } from './links/LinksRouteSkeleton';
import { SettingsRouteSkeleton } from './settings/SettingsRouteSkeleton';
import {
  isCalendarShellRoute,
  isChatShellRoute,
  isEarningsShellRoute,
  isLibraryShellRoute,
  isLinksShellRoute,
  isLyricsShellRoute,
  isPresenceShellRoute,
  isReleasesShellRoute,
  isSettingsShellRoute,
  isTasksShellRoute,
  isTouringShellRoute,
} from './shell-route-matches';
import {
  LibraryLoadingStateLazy,
  ProfilesRouteSkeletonLazy,
  ReleaseTableSkeletonLazy,
} from './shell-route-table-skeletons';
import { TourDatesRouteSkeleton } from './tour-dates/TourDatesRouteSkeleton';

/**
 * Route-shaped main slot for the first authenticated shell boot.
 *
 * The shell segment deliberately has no `loading.tsx` (see
 * `warm-navigation.contract.test.ts`): a segment loading boundary would
 * replace the current page on every warm navigation. The layout's Suspense
 * fallback is the one place a skeleton shows, so each primary route gets a
 * skeleton with its own frame, toolbar and header geometry here. `undefined`
 * keeps the generic AppShellSkeleton main.
 */
export function resolveShellRouteSkeleton(
  pathname: string | null
): ReactNode | undefined {
  if (isChatShellRoute(pathname)) return <ChatLoading />;
  if (isReleasesShellRoute(pathname)) {
    return <ReleaseTableSkeletonLazy showHeader={false} />;
  }
  if (isLibraryShellRoute(pathname)) return <LibraryLoadingStateLazy />;
  if (isLyricsShellRoute(pathname)) return <LyricsRouteSkeleton />;
  if (isTasksShellRoute(pathname)) return <TasksRouteSkeleton />;
  if (isCalendarShellRoute(pathname)) return <CalendarRouteSkeleton />;
  if (isLinksShellRoute(pathname)) return <LinksRouteSkeleton />;
  if (isPresenceShellRoute(pathname)) return <ProfilesRouteSkeletonLazy />;
  if (isTouringShellRoute(pathname)) return <TourDatesRouteSkeleton />;
  if (isSettingsShellRoute(pathname) || isEarningsShellRoute(pathname)) {
    return <SettingsRouteSkeleton />;
  }
  return undefined;
}
