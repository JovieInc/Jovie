import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCanAccessTasksWorkspace,
  mockDbSelect,
  mockDbRows,
  mockGetCurrentUserEntitlements,
  mockLoadAppShellRouteContext,
  mockNotFound,
  mockRedirect,
} = vi.hoisted(() => ({
  mockCanAccessTasksWorkspace: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbRows: { rows: [] as Array<Record<string, unknown>> },
  mockGetCurrentUserEntitlements: vi.fn(),
  mockLoadAppShellRouteContext: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
  redirect: mockRedirect,
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogReleases: {
    id: 'discogReleases.id',
    title: 'discogReleases.title',
    releaseDate: 'discogReleases.releaseDate',
    creatorProfileId: 'discogReleases.creatorProfileId',
  },
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/entitlements/tasks-gate', () => ({
  canAccessTasksWorkspace: mockCanAccessTasksWorkspace,
}));

vi.mock('@/app/app/(shell)/app-shell-route-context', () => ({
  loadAppShellRouteContext: mockLoadAppShellRouteContext,
}));

vi.mock('@/components/features/dashboard/release-tasks', () => ({
  ReleaseTaskPage: ({
    releaseId,
    releaseTitle,
  }: {
    releaseId: string;
    releaseTitle: string;
  }) => (
    <div data-testid='release-task-page'>
      {releaseId}:{releaseTitle}
    </div>
  ),
  ReleaseTaskPageSkeleton: () => (
    <div data-testid='release-task-page-skeleton'>Loading tasks</div>
  ),
}));

vi.mock(
  '@/components/features/dashboard/tasks/TasksUpgradeInterstitial',
  () => ({
    ReleasePlanUpgradeInterstitial: ({
      releaseTitle,
    }: {
      releaseTitle?: string | null;
    }) => (
      <div data-testid='release-plan-upgrade-interstitial'>{releaseTitle}</div>
    ),
  })
);

import LegacyReleaseTasksPage from '@/app/app/(shell)/dashboard/releases/[releaseId]/tasks/page';
import CanonicalReleaseTasksPage from '@/app/app/(shell)/releases/[releaseId]/tasks/page';

function setupReleaseQueryRows(rows: Array<Record<string, unknown>>) {
  mockDbRows.rows = rows;
  mockDbSelect.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(mockDbRows.rows),
      }),
    }),
  }));
}

async function renderResolvedTasksContent() {
  const tree = await CanonicalReleaseTasksPage({
    params: Promise.resolve({ releaseId: 'release_1' }),
  });
  const tasksContentElement = (tree as React.ReactElement).props.children;
  const resolvedElement = await tasksContentElement.type(
    tasksContentElement.props
  );
  render(resolvedElement);
}

describe('release tasks page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadAppShellRouteContext.mockResolvedValue({
      ok: true,
      profileId: 'profile_1',
      userId: 'user_1',
      dashboardData: {},
    });
    mockGetCurrentUserEntitlements.mockResolvedValue({
      isAdmin: false,
      canAccessTasksWorkspace: false,
      canAccessMetadataSubmissionAgent: false,
    });
    setupReleaseQueryRows([
      {
        title: 'My Release',
        releaseDate: new Date('2025-06-01T00:00:00.000Z'),
      },
    ]);
  });

  it('renders the upgrade interstitial for locked users', async () => {
    mockCanAccessTasksWorkspace.mockResolvedValueOnce(false);

    await renderResolvedTasksContent();

    expect(mockLoadAppShellRouteContext).toHaveBeenCalledWith({
      route: '/app/releases/release_1/tasks',
      dashboardErrorLogMessage:
        'Dashboard data load failed on release tasks page',
      dashboardErrorMessage:
        'Failed to load release task data. Please refresh the page.',
    });
    expect(
      screen.getByTestId('release-plan-upgrade-interstitial')
    ).toHaveTextContent('My Release');
    expect(screen.queryByTestId('release-task-page')).not.toBeInTheDocument();
  });

  it('renders the release task page for entitled users', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValueOnce({
      isAdmin: false,
      canAccessTasksWorkspace: true,
      canAccessMetadataSubmissionAgent: false,
    });

    await renderResolvedTasksContent();

    expect(screen.getByTestId('release-task-page')).toHaveTextContent(
      'release_1:My Release'
    );
  });

  it('keeps the legacy dashboard route aliased to the canonical release route', () => {
    expect(LegacyReleaseTasksPage).toBe(CanonicalReleaseTasksPage);
  });

  it('keeps release task shell/profile loading on the shared route context', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'app/app/(shell)/releases/[releaseId]/tasks/ReleaseTasksRoute.tsx'
      ),
      'utf8'
    );

    expect(source).toContain('loadAppShellRouteContext');
    expect(source).toContain('buildReleaseTasksRoute');
    expect(source).not.toContain('getCurrentUserProfile');
    expect(source).not.toContain('getDashboardShellData');
    expect(source).not.toContain('getDashboardDataEssential');
  });
});
