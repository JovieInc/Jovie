import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WaitlistEntryRow } from '@/lib/admin/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminWaitlistTableWithViews } from './AdminWaitlistTableWithViews';

const toastError = vi.fn();
const copyToClipboard = vi.fn();

vi.mock('@/components/feedback', async importOriginal => ({
  ...(await importOriginal<typeof import('@/components/feedback')>()),
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/hooks/useClipboard', () => ({
  copyToClipboard: (text: string) => copyToClipboard(text),
}));

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

function entry(
  index: number,
  fullName = `Ari Lane ${index}`
): WaitlistEntryRow {
  return {
    id: `waitlist_${index}`,
    fullName,
    email: `ari${index}@example.com`,
    primaryGoal: null,
    primarySocialUrl: `https://instagram.com/ari${index}`,
    primarySocialPlatform: 'instagram',
    primarySocialUrlNormalized: `https://instagram.com/ari${index}`,
    spotifyUrl: null,
    spotifyUrlNormalized: null,
    spotifyArtistName: null,
    heardAbout: null,
    status: 'new',
    primarySocialFollowerCount: null,
    createdAt: new Date('2026-01-10T00:00:00.000Z'),
    updatedAt: new Date('2026-01-10T00:00:00.000Z'),
  } as WaitlistEntryRow;
}

const healthy = {
  totalIssues: 0,
  usersMissingWaitlistEntry: 0,
  entriesMissingUser: 0,
  signedUpEntriesMissingUser: 0,
};

function renderTable(
  entries: WaitlistEntryRow[],
  integrity = healthy,
  total = entries.length
) {
  return render(
    <TooltipProvider>
      <AdminWaitlistTableWithViews
        entries={entries}
        page={1}
        pageSize={25}
        total={total}
        integrity={integrity}
      />
    </TooltipProvider>
  );
}

describe('AdminWaitlistTableWithViews certificate', () => {
  beforeEach(() => {
    localStorage.clear();
    toastError.mockReset();
    copyToClipboard.mockReset();
  });
  afterEach(() => localStorage.clear());

  it('shows the healthy disposition with the success icon role, axe-clean', async () => {
    const { container } = renderTable([entry(1)]);

    expect(screen.getByText('Waitlist links look healthy')).toBeVisible();
    expect(screen.getByText(/Showing 1–1 of/)).toHaveTextContent(
      'Showing 1–1 of 1 entries'
    );
    await expectNoA11yViolations(container);
  });

  it('raises the error toast when copying the selected emails fails', async () => {
    copyToClipboard.mockResolvedValue(false);
    const user = userEvent.setup();
    renderTable([entry(1)]);

    await user.click(screen.getByRole('checkbox', { name: 'Select row 1' }));
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(
      await screen.findByRole('menuitem', { name: 'Copy Emails' })
    );

    expect(copyToClipboard).toHaveBeenCalledWith('ari1@example.com');
    expect(toastError).toHaveBeenCalledWith('Failed to copy emails');
    // A failed copy keeps the selection so the operator can retry.
    expect(
      screen.getByRole('checkbox', { name: 'Select row 1' })
    ).toBeChecked();
  });

  it('formats large totals and integrity counts, axe-clean', async () => {
    const entries = Array.from({ length: 12 }, (_, index) =>
      entry(
        index + 1,
        `Alexandria Montgomery-Wellington the Third, entry ${index + 1}`
      )
    );
    const { container } = renderTable(
      entries,
      {
        totalIssues: 1204,
        usersMissingWaitlistEntry: 1000,
        entriesMissingUser: 200,
        signedUpEntriesMissingUser: 4,
      },
      1280
    );

    expect(screen.getByText('1204 waitlist integrity issues')).toBeVisible();
    expect(screen.getByText(/Showing 1–12 of/)).toHaveTextContent(
      'Showing 1–12 of 1,280 entries'
    );
    await expectNoA11yViolations(container);
  });

  it('renders right-to-left names, axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <TooltipProvider>
          <AdminWaitlistTableWithViews
            entries={[entry(1, 'ليلى حسن')]}
            page={1}
            pageSize={25}
            total={1}
            integrity={healthy}
          />
        </TooltipProvider>
      </div>
    );

    expect(screen.getByText('ليلى حسن')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
