import type { ReactNode } from 'react';
import {
  DashboardShellContent,
  EssentialShellReady,
} from './DashboardShellContent';

export const dashboardData = {
  user: { id: 'user-1' },
  creatorProfiles: [],
  selectedProfile: null,
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  hasMusicLinks: false,
  isAdmin: true,
  tippingStats: { totalTips: 0, totalAmount: 0, recentTips: [] },
  profileCompletion: {
    percentage: 0,
    completedCount: 0,
    totalCount: 0,
    steps: [],
    profileIsLive: false,
  },
};

export const shell = (
  mode: 'ov' | 'customer',
  child: ReactNode,
  pathname = '/app'
) =>
  DashboardShellContent({ userId: 'user-1', pathname, mode, children: child });

export const essentialReady = (
  workspacePromise: Promise<readonly [typeof dashboardData, object]>,
  child: ReactNode,
  pathname = '/app/contacts'
) =>
  EssentialShellReady({
    workspacePromise: workspacePromise as never,
    userId: 'user-1',
    pathname,
    mode: 'customer',
    cookieStore: { get: () => undefined } as never,
    privacyEnabled: false,
    lockedUntil: null,
    children: child,
  });

export const boundaryMount = () =>
  document
    .querySelector('[data-boundary-mount]')
    ?.getAttribute('data-boundary-mount');
