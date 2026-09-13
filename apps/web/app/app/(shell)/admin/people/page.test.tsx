import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  parsePeopleParams: vi.fn(),
  getFeedback: vi.fn(),
  loadInbox: vi.fn(),
}));

vi.mock('@/components/features/admin/AdminPeopleRightPanelProvider', () => ({
  AdminPeopleRightPanelProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock(
  '@/components/features/admin/admin-creator-profiles/AdminCreatorsPageWrapper',
  () => ({
    AdminCreatorsPageWrapper: () => null,
  })
);
vi.mock('@/components/features/admin/admin-releases-table', () => ({
  AdminReleasesPageWrapper: () => null,
}));
vi.mock(
  '@/components/features/admin/admin-users-table/AdminUsersTableUnified',
  () => ({
    AdminUsersTableUnified: () => null,
  })
);
vi.mock(
  '@/components/features/admin/feedback-table/AdminFeedbackTable',
  () => ({
    AdminFeedbackTable: () => <div data-testid='admin-feedback-table' />,
  })
);
vi.mock(
  '@/components/features/admin/founder-review/OvieFounderReviewSurface',
  () => ({
    OvieFounderReviewSurface: ({
      cards,
      loadError,
    }: {
      cards: unknown[];
      loadError?: boolean;
    }) => (
      <div
        data-testid='ovie-founder-review-entry'
        data-card-count={cards.length}
        data-load-error={loadError ? 'true' : undefined}
      />
    ),
  })
);
vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/features/admin/WaitlistMetrics', () => ({
  WaitlistMetrics: () => null,
}));
vi.mock('@/components/features/admin/WaitlistSettingsPanel', () => ({
  WaitlistSettingsPanel: () => null,
}));
vi.mock(
  '@/components/features/admin/waitlist-table/AdminWaitlistTableWithViews',
  () => ({
    AdminWaitlistTableWithViews: () => null,
  })
);
vi.mock('@/lib/admin/creator-profiles', () => ({
  getAdminCreatorProfiles: vi.fn(),
}));
vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: mocks.requireAdmin,
}));
vi.mock('@/lib/admin/releases', () => ({ getAdminReleases: vi.fn() }));
vi.mock('@/lib/admin/users', () => ({ getAdminUsers: vi.fn() }));
vi.mock('@/lib/admin/waitlist', () => ({
  getAdminWaitlistEntries: vi.fn(),
  getWaitlistIntegritySummary: vi.fn(),
  getWaitlistMetrics: vi.fn(),
}));
vi.mock('@/lib/feedback', () => ({
  getAdminFeedbackItemsResult: mocks.getFeedback,
}));
vi.mock('@/lib/connectors/opportunity-inbox-data', () => ({
  loadOpportunityInboxData: mocks.loadInbox,
}));
vi.mock('@/lib/nuqs', () => ({
  adminPeopleSearchParams: { parse: mocks.parsePeopleParams },
  adminCreatorsSortFields: [],
  adminReleasesSortFields: [],
  adminUsersSortFields: [],
}));

describe('Ovie founder-review entrypoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue('admin-user');
    mocks.parsePeopleParams.mockResolvedValue({
      view: 'feedback',
      page: 1,
      pageSize: 50,
      q: null,
      sort: 'created_desc',
    });
    mocks.getFeedback.mockResolvedValue({ items: [], error: null });
    mocks.loadInbox.mockResolvedValue({ cards: [{ id: 'card-1' }] });
  });

  it('keeps founder capture in the admin-owned feedback view', async () => {
    const { default: AdminPeoplePage } = await import('./page');

    render(
      await AdminPeoplePage({
        searchParams: Promise.resolve({ view: 'feedback' }),
      })
    );

    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.loadInbox).toHaveBeenCalledWith('admin-user');
    expect(screen.getByTestId('ovie-founder-review-entry')).toHaveAttribute(
      'data-card-count',
      '1'
    );
    expect(screen.getByTestId('admin-feedback-table')).toBeInTheDocument();
  });

  it('represents a founder queue load failure instead of a false empty state', async () => {
    mocks.loadInbox.mockRejectedValueOnce(new Error('queue unavailable'));
    const { default: AdminPeoplePage } = await import('./page');

    render(
      await AdminPeoplePage({
        searchParams: Promise.resolve({ view: 'feedback' }),
      })
    );

    expect(screen.getByTestId('ovie-founder-review-entry')).toHaveAttribute(
      'data-load-error',
      'true'
    );
  });
});
