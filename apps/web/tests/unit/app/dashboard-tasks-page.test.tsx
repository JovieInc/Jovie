import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetCurrentUserEntitlements } = vi.hoisted(() => ({
  mockGetCurrentUserEntitlements: vi.fn(),
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/components/features/dashboard/tasks/TasksPageClient', () => ({
  TasksPageClient: () => (
    <div data-testid='tasks-page-client'>Tasks Client</div>
  ),
}));

vi.mock(
  '@/components/features/dashboard/tasks/TasksUpgradeInterstitial',
  () => ({
    TasksWorkspaceUpgradeInterstitial: () => (
      <div data-testid='tasks-upgrade-interstitial'>Tasks Upgrade</div>
    ),
  })
);

import TasksPage from '@/app/app/(shell)/dashboard/tasks/page';

describe('dashboard tasks page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the upgrade interstitial for users without task access', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValueOnce({
      canAccessTasksWorkspace: false,
    });

    render(await TasksPage());

    expect(
      screen.getByTestId('tasks-upgrade-interstitial')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('tasks-page-client')).not.toBeInTheDocument();
  });

  it('renders the tasks workspace for users with task access', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValueOnce({
      canAccessTasksWorkspace: true,
    });

    render(await TasksPage());

    expect(screen.getByTestId('tasks-page-client')).toBeInTheDocument();
    expect(
      screen.queryByTestId('tasks-upgrade-interstitial')
    ).not.toBeInTheDocument();
  });
});
