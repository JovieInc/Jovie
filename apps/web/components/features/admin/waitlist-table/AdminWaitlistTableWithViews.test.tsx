import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WaitlistEntryRow } from '@/lib/admin/types';
import { AdminWaitlistTableWithViews } from './AdminWaitlistTableWithViews';

vi.mock('@/lib/queries', () => ({
  QueryErrorBoundary: ({ children }: { children: ReactNode }) => children,
  useAdminWaitlistInfiniteQuery: ({
    initialData,
  }: {
    initialData: { rows: WaitlistEntryRow[]; total: number };
  }) => ({
    data: { pages: [initialData] },
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
  useApproveWaitlistMutation: () => ({ mutateAsync: vi.fn() }),
  useDisapproveWaitlistMutation: () => ({ mutateAsync: vi.fn() }),
  useResendWaitlistInviteMutation: () => ({ mutateAsync: vi.fn() }),
}));

const entries: WaitlistEntryRow[] = [
  {
    id: 'waitlist_1',
    fullName: 'Ari Lane',
    email: 'ari@example.com',
    primaryGoal: null,
    primarySocialUrl: 'https://instagram.com/ari',
    primarySocialPlatform: 'instagram',
    primarySocialUrlNormalized: 'https://instagram.com/ari',
    spotifyUrl: null,
    spotifyUrlNormalized: null,
    spotifyArtistName: null,
    heardAbout: null,
    status: 'new',
    primarySocialFollowerCount: null,
    createdAt: new Date('2026-01-10T00:00:00.000Z'),
    updatedAt: new Date('2026-01-10T00:00:00.000Z'),
  } as WaitlistEntryRow,
];

describe('AdminWaitlistTableWithViews', () => {
  beforeEach(() => localStorage.clear());
  it('keeps integrity visible and excludes covered actions until selection is cleared', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <AdminWaitlistTableWithViews
          entries={entries}
          page={1}
          pageSize={25}
          total={1}
          integrity={{
            totalIssues: 3,
            usersMissingWaitlistEntry: 2,
            entriesMissingUser: 1,
            signedUpEntriesMissingUser: 0,
          }}
        />
      </TooltipProvider>
    );
    const notice = screen.getByText('3 waitlist integrity issues');
    expect(
      screen.getByRole('button', { name: 'Export waitlist to CSV file' })
    ).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: 'Select row 1' }));
    expect(notice).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Export waitlist to CSV file' })
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Display' })).toBeNull();
    const clear = screen.getByRole('button', { name: 'Clear', exact: true });
    // The overlay's positioning boundary must not include the integrity notice.
    expect(clear.closest('.relative')).not.toContainElement(notice);
    await user.click(clear);
    expect(
      screen.getByRole('button', { name: 'Export waitlist to CSV file' })
    ).toBeVisible();
    expect(
      screen.getByRole('checkbox', { name: 'Select row 1' })
    ).not.toBeChecked();
  });
});
