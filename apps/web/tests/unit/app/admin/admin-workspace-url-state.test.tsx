import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getAdminCreatorProfiles,
  getAdminUsers,
  getAdminReleases,
  getAdminWaitlistEntries,
  getWaitlistMetrics,
  getAdminFeedbackItems,
  getRecentIngestHistory,
} = vi.hoisted(() => ({
  getAdminCreatorProfiles: vi.fn(),
  getAdminUsers: vi.fn(),
  getAdminReleases: vi.fn(),
  getAdminWaitlistEntries: vi.fn(),
  getWaitlistMetrics: vi.fn(),
  getAdminFeedbackItems: vi.fn(),
  getRecentIngestHistory: vi.fn(),
}));

vi.mock('@/lib/admin/creator-profiles', () => ({
  getAdminCreatorProfiles,
}));

vi.mock('@/lib/admin/users', () => ({
  getAdminUsers,
}));

vi.mock('@/lib/admin/releases', () => ({
  getAdminReleases,
}));

vi.mock('@/lib/admin/waitlist', () => ({
  getAdminWaitlistEntries,
  getWaitlistMetrics,
}));

vi.mock('@/lib/feedback', () => ({
  getAdminFeedbackItems,
}));

vi.mock(
  '@/components/features/admin/admin-creator-profiles/AdminCreatorsPageWrapper',
  () => ({
    AdminCreatorsPageWrapper: (props: unknown) => (
      <pre data-testid='creators-props'>{JSON.stringify(props)}</pre>
    ),
  })
);

vi.mock('@/components/features/admin/WaitlistMetrics', () => ({
  WaitlistMetrics: () => null,
}));

vi.mock(
  '@/components/features/admin/waitlist-table/AdminWaitlistTableWithViews',
  () => ({
    AdminWaitlistTableWithViews: () => null,
  })
);

vi.mock(
  '@/components/features/admin/admin-users-table/AdminUsersTableUnified',
  () => ({
    AdminUsersTableUnified: () => null,
  })
);

vi.mock('@/components/features/admin/admin-releases-table', () => ({
  AdminReleasesPageWrapper: () => null,
}));

vi.mock(
  '@/components/features/admin/feedback-table/AdminFeedbackTable',
  () => ({
    AdminFeedbackTable: () => null,
  })
);

vi.mock('@/components/features/admin/leads/LeadPipelineKpis', () => ({
  LeadPipelineKpis: () => null,
}));

vi.mock('@/components/features/admin/leads/LeadPipelineWorkspace', () => ({
  LeadPipelineWorkspace: (props: unknown) => (
    <pre data-testid='lead-workspace-props'>{JSON.stringify(props)}</pre>
  ),
}));

vi.mock('@/components/features/admin/campaigns/InviteCampaignManager', () => ({
  InviteCampaignManager: () => null,
}));

vi.mock('@/components/features/admin/outreach/OutreachOverviewPanel', () => ({
  OutreachOverviewPanel: () => null,
}));

vi.mock('@/components/features/admin/outreach/EmailQueuePanel', () => ({
  EmailQueuePanel: () => null,
}));

vi.mock('@/components/features/admin/outreach/DmQueuePanel', () => ({
  DmQueuePanel: () => null,
}));

vi.mock('@/components/features/admin/outreach/ReviewQueuePanel', () => ({
  ReviewQueuePanel: () => null,
}));

vi.mock('@/lib/admin/ingest-history', () => ({
  getRecentIngestHistory,
}));

vi.mock('@/app/app/(shell)/admin/ingest/AdminIngestPageClient', () => ({
  AdminIngestContent: () => null,
}));

import AdminGrowthPage from '@/app/app/(shell)/admin/growth/page';
import AdminPeoplePage from '@/app/app/(shell)/admin/people/page';

describe('admin workspace URL state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes canonical page and query params into the creators workspace fetch and wrapper', async () => {
    getAdminCreatorProfiles.mockResolvedValue({
      profiles: [],
      pageSize: 40,
      total: 0,
    });

    render(
      await AdminPeoplePage({
        searchParams: Promise.resolve({
          view: 'creators',
          page: '3',
          pageSize: '40',
          q: 'tim',
          sort: 'created_desc',
        }),
      })
    );

    expect(getAdminCreatorProfiles).toHaveBeenCalledWith({
      page: 3,
      pageSize: 40,
      search: 'tim',
      sort: 'created_desc',
    });

    expect(screen.getByTestId('creators-props')).toHaveTextContent('"page":3');
    expect(screen.getByTestId('creators-props')).toHaveTextContent(
      '"/app/admin/people?view=creators"'
    );
  });

  it('hydrates the leads workspace from canonical growth search params', async () => {
    render(
      await AdminGrowthPage({
        searchParams: Promise.resolve({
          view: 'leads',
          q: 'spotify',
        }),
      })
    );

    expect(screen.getByTestId('lead-workspace-props')).toHaveTextContent(
      '"initialSearch":"spotify"'
    );
    expect(screen.getByTestId('lead-workspace-props')).toHaveTextContent(
      '"/app/admin/growth?view=leads"'
    );
  });
});
