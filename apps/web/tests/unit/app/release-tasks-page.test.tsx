import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCanAccessTasksWorkspace,
  mockDbSelect,
  mockDbRows,
  mockGetCurrentUserProfile,
  mockGetCurrentUserEntitlements,
  mockNotFound,
} = vi.hoisted(() => ({
  mockCanAccessTasksWorkspace: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbRows: { rows: [] as Array<Record<string, unknown>> },
  mockGetCurrentUserProfile: vi.fn(),
  mockGetCurrentUserEntitlements: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
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

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserProfile: mockGetCurrentUserProfile,
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

import ReleaseTasksPage from '@/app/app/(shell)/dashboard/releases/[releaseId]/tasks/page';

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
  const tree = await ReleaseTasksPage({
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
    mockGetCurrentUserProfile.mockResolvedValue({
      id: 'profile_1',
      onboardingCompletedAt: '2026-01-01T00:00:00.000Z',
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
});
