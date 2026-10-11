import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AdminPeoplePage from './page';

const {
  mockAdminAssetsPageWrapper,
  mockAdminPage,
  mockGetAdminAssets,
  mockParse,
} = vi.hoisted(() => ({
  mockAdminAssetsPageWrapper: vi.fn(() => null),
  mockAdminPage: vi.fn(({ children }: { children: ReactNode }) => children),
  mockGetAdminAssets: vi.fn(),
  mockParse: vi.fn(() => ({
    page: 2,
    pageSize: 50,
    view: 'assets',
    sort: 'title_asc',
    q: 'first',
    stage: null,
    type: 'release',
    issues: 'issues',
    verified: 'verified',
  })),
}));

vi.mock('next/dynamic', () => ({
  default: () => mockAdminAssetsPageWrapper,
}));
vi.mock('@/components/features/admin/AdminPeopleRightPanelProvider', () => ({
  AdminPeopleRightPanelProvider: ({ children }: { children: ReactNode }) =>
    children,
}));
vi.mock('@/components/features/admin/admin-assets-table', () => ({
  AdminAssetsPageWrapper: mockAdminAssetsPageWrapper,
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
  '@/components/features/admin/contacts-table/AdminContactsTable',
  () => ({ AdminContactsTable: () => null })
);
vi.mock(
  '@/components/features/admin/feedback-table/AdminFeedbackTable',
  () => ({
    AdminFeedbackTable: () => null,
  })
);
vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: mockAdminPage,
}));
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
vi.mock('@/constants/admin-navigation', () => ({
  adminPeopleViews: ['assets'],
  buildAdminPeopleHref: (view: string) => `/admin/people?view=${view}`,
  getAdminPeopleViewLabel: (view: string) => view,
  isAdminPeopleView: (view: string) => view === 'assets',
}));
vi.mock('@/lib/admin/assets', () => ({
  adminAssetSortFields: [
    'created_desc',
    'created_asc',
    'title_asc',
    'title_desc',
  ],
  getAdminAssets: mockGetAdminAssets,
}));
vi.mock('@/lib/admin/contacts', () => ({ getCanonicalContacts: vi.fn() }));
vi.mock('@/lib/admin/creator-profiles', () => ({
  getAdminCreatorProfiles: vi.fn(),
}));
vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: vi.fn().mockResolvedValue('user_admin'),
}));
vi.mock('@/lib/admin/releases', () => ({ getAdminReleases: vi.fn() }));
vi.mock('@/lib/admin/users', () => ({ getAdminUsers: vi.fn() }));
vi.mock('@/lib/admin/waitlist', () => ({
  getAdminWaitlistEntries: vi.fn(),
  getWaitlistIntegritySummary: vi.fn(),
  getWaitlistMetrics: vi.fn(),
}));
vi.mock('@/lib/feedback', () => ({
  getAdminFeedbackItemsResult: vi.fn(),
}));
vi.mock('@/lib/nuqs', () => ({
  adminCreatorsSortFields: ['created_desc'],
  adminPeopleSearchParams: { parse: mockParse },
  adminReleasesSortFields: ['release_date_desc'],
  adminUsersSortFields: ['created_desc'],
}));

describe('AdminPeoplePage assets view', () => {
  it('loads canonical assets and renders the asset table', async () => {
    mockGetAdminAssets.mockResolvedValue({
      assets: [{ id: 'asset-1' }],
      pageSize: 50,
      total: 1,
    });

    const tree = await AdminPeoplePage({ searchParams: Promise.resolve({}) });

    expect(mockGetAdminAssets).toHaveBeenCalledWith({
      page: 2,
      pageSize: 50,
      search: 'first',
      sort: 'title_asc',
      type: 'release',
      issues: 'issues',
      verified: 'verified',
    });
    const provider = tree.props.children;
    const assetsTable = provider.props.children;
    expect(assetsTable.type).toBe(mockAdminAssetsPageWrapper);
    expect(assetsTable.props).toEqual({
      assets: [{ id: 'asset-1' }],
      pageSize: 50,
      total: 1,
      search: 'first',
      sort: 'title_asc',
      type: 'release',
      issues: 'issues',
      verified: 'verified',
    });
    expect(tree.type).toBe(mockAdminPage);
    expect(tree.props.tabs).toEqual(
      expect.objectContaining({
        clearOnPrimaryChange: ['type', 'issues', 'verified', 'key'],
        value: 'assets',
      })
    );
  });
});
