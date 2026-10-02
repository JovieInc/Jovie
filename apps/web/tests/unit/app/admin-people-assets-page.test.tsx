import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPeoplePage from '@/app/app/(shell)/admin/people/page';

const { mockGetAdminAssets, mockAssetsWrapper } = vi.hoisted(() => ({
  mockGetAdminAssets: vi.fn(),
  mockAssetsWrapper: vi.fn((_props: unknown) => (
    <div data-testid='admin-assets-wrapper' />
  )),
}));

vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({
    children,
    testId,
  }: {
    readonly children: ReactNode;
    readonly testId: string;
  }) => <section data-testid={testId}>{children}</section>,
}));

vi.mock('@/components/features/admin/AdminPeopleRightPanelProvider', () => ({
  AdminPeopleRightPanelProvider: ({
    children,
  }: {
    readonly children: ReactNode;
  }) => <>{children}</>,
}));

vi.mock('@/components/features/admin/admin-assets-table', () => ({
  AdminAssetsPageWrapper: (props: unknown) => mockAssetsWrapper(props),
}));
vi.mock(
  '@/components/features/admin/admin-creator-profiles/AdminCreatorsPageWrapper',
  () => ({ AdminCreatorsPageWrapper: () => null })
);
vi.mock('@/components/features/admin/admin-releases-table', () => ({
  AdminReleasesPageWrapper: () => null,
}));
vi.mock(
  '@/components/features/admin/admin-users-table/AdminUsersTableUnified',
  () => ({ AdminUsersTableUnified: () => null })
);
vi.mock(
  '@/components/features/admin/feedback-table/AdminFeedbackTable',
  () => ({
    AdminFeedbackTable: () => null,
  })
);
vi.mock('@/components/features/admin/WaitlistMetrics', () => ({
  WaitlistMetrics: () => null,
}));
vi.mock('@/components/features/admin/WaitlistSettingsPanel', () => ({
  WaitlistSettingsPanel: () => null,
}));
vi.mock(
  '@/components/features/admin/waitlist-table/AdminWaitlistTableWithViews',
  () => ({ AdminWaitlistTableWithViews: () => null })
);

vi.mock('@/lib/admin/assets', () => ({
  adminAssetSortFields: [
    'created_desc',
    'created_asc',
    'title_asc',
    'title_desc',
  ],
  getAdminAssets: mockGetAdminAssets,
}));
vi.mock('@/lib/admin/creator-profiles', () => ({
  getAdminCreatorProfiles: vi.fn(),
}));
vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: vi.fn().mockResolvedValue('user_admin'),
}));
vi.mock('@/lib/admin/releases', () => ({ getAdminReleases: vi.fn() }));
vi.mock('@/lib/admin/users', () => ({ getAdminUsers: vi.fn() }));
vi.mock('@/lib/admin/contacts', () => ({ getCanonicalContacts: vi.fn() }));
vi.mock(
  '@/components/features/admin/contacts-table/AdminContactsTable',
  () => ({
    AdminContactsTable: () => null,
  })
);
vi.mock('@/lib/admin/waitlist', () => ({
  getAdminWaitlistEntries: vi.fn(),
  getWaitlistIntegritySummary: vi.fn(),
  getWaitlistMetrics: vi.fn(),
}));
vi.mock('@/lib/feedback', () => ({
  getAdminFeedbackItemsResult: vi.fn().mockResolvedValue({
    items: [],
    error: null,
  }),
}));

const parsedParams = vi.hoisted(() => ({
  value: {
    view: 'assets',
    sort: 'title_asc',
    q: 'bloom',
    type: 'release',
    issues: 'issues',
    verified: 'verified',
    page: 2,
    pageSize: 25,
  },
}));

vi.mock('@/lib/nuqs', () => ({
  adminCreatorsSortFields: ['created_desc'],
  adminPeopleSearchParams: { parse: vi.fn(async () => parsedParams.value) },
  adminReleasesSortFields: ['release_date_desc'],
  adminUsersSortFields: ['created_desc'],
}));

describe('admin people page — assets view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminAssets.mockResolvedValue({
      assets: [],
      pageSize: 25,
      total: 0,
    });
  });

  it('loads assets with URL filters and renders the wrapper', async () => {
    render(await AdminPeoplePage({ searchParams: Promise.resolve({}) }));

    expect(mockGetAdminAssets).toHaveBeenCalledWith({
      page: 2,
      pageSize: 25,
      search: 'bloom',
      sort: 'title_asc',
      type: 'release',
      issues: 'issues',
      verified: 'verified',
    });
    expect(
      await screen.findByTestId('admin-assets-wrapper')
    ).toBeInTheDocument();
    expect(mockAssetsWrapper).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: 'title_asc',
        type: 'release',
        issues: 'issues',
        verified: 'verified',
      })
    );
  });

  it('falls back to created_desc for an unknown sort', async () => {
    parsedParams.value = { ...parsedParams.value, sort: 'bogus' };
    render(await AdminPeoplePage({ searchParams: Promise.resolve({}) }));
    expect(mockGetAdminAssets).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'created_desc' })
    );
    parsedParams.value = { ...parsedParams.value, sort: 'title_asc' };
  });
});
