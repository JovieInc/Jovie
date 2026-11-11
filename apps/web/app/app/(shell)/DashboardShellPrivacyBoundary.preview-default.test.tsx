import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The (shell) layout computes previewPanelDefaultOpen once from the first
// request's path. These tests pin that the boundary follows the live path.
const { route, shellProps } = vi.hoisted(() => ({
  route: { pathname: null as string | null },
  shellProps: { previewPanelDefaultOpen: undefined as boolean | undefined },
}));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('@/lib/workspace-lock/workspace-lock', async () => ({
  ...(await vi.importActual<
    typeof import('@/lib/workspace-lock/workspace-lock')
  >('@/lib/workspace-lock/workspace-lock')),
  getWorkspacePrivacyLockState: vi.fn(() => new Promise(() => undefined)),
}));
vi.mock('@/components/organisms/AuthShellWrapper', () => ({
  AuthShellWrapper: ({
    children,
    previewPanelDefaultOpen,
  }: {
    children: React.ReactNode;
    previewPanelDefaultOpen?: boolean;
  }) => {
    shellProps.previewPanelDefaultOpen = previewPanelDefaultOpen;
    return <div>{children}</div>;
  },
}));
vi.mock('./dashboard/DashboardDataContext', () => ({
  DashboardDataProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

import { DashboardShellPrivacyBoundary } from './DashboardShellPrivacyBoundary';
import type { DashboardData } from './dashboard/actions/dashboard-data';

const dashboard = {
  user: { id: 'user-1' },
  creatorProfiles: [{ id: 'profile-1' }],
  selectedProfile: { id: 'profile-1' },
} as unknown as DashboardData;

function renderBoundary(serverDefaultOpen: boolean) {
  render(
    <DashboardShellPrivacyBoundary
      mode='customer'
      userId='user-1'
      dashboardData={dashboard}
      initiallyLocked={false}
      privacyEnabled={false}
      lockedUntil={null}
      sidebarDefaultOpen
      previewPanelDefaultOpen={serverDefaultOpen}
      persistSidebarCollapsed={async () => {}}
    >
      <div>Page</div>
    </DashboardShellPrivacyBoundary>
  );
}

describe('DashboardShellPrivacyBoundary preview rail default', () => {
  beforeEach(() => {
    route.pathname = null;
    shellProps.previewPanelDefaultOpen = undefined;
  });

  it('opens the profile companion after client navigation from Account', () => {
    // The layout rendered for /app/settings/account and computed `false`.
    route.pathname = '/app/settings/profile';
    renderBoundary(false);
    expect(shellProps.previewPanelDefaultOpen).toBe(true);
  });

  it('follows the live path back to Account', () => {
    route.pathname = '/app/settings/account';
    renderBoundary(true);
    expect(shellProps.previewPanelDefaultOpen).toBe(false);
  });

  it('keeps the server value when there is no router path', () => {
    renderBoundary(false);
    expect(shellProps.previewPanelDefaultOpen).toBe(false);
  });
});
