import { TooltipProvider } from '@jovie/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WaitlistEntryRow } from '@/lib/admin/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({
  approveEntry: vi.fn(),
  resendInvite: vi.fn(),
  copyToClipboard: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('./useApproveEntry', () => ({
  useApproveEntry: () => ({
    approveEntry: mocks.approveEntry,
    resendInvite: mocks.resendInvite,
  }),
}));
vi.mock('@/hooks/useClipboard', () => ({
  copyToClipboard: mocks.copyToClipboard,
}));
vi.mock('@/components/feedback', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

import { AdminWaitlistTableUnified } from './AdminWaitlistTableUnified';

const LONG_NAME =
  'Aurelia Montgomery-Fitzgerald and the Extraordinarily Long Named Midnight Orchestra';

function entry(overrides: Partial<WaitlistEntryRow> = {}): WaitlistEntryRow {
  return {
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
    ...overrides,
  } as WaitlistEntryRow;
}

function renderTable(
  props: Partial<React.ComponentProps<typeof AdminWaitlistTableUnified>> = {},
  dir?: 'rtl'
) {
  return render(
    <TooltipProvider>
      <div dir={dir}>
        <AdminWaitlistTableUnified
          entries={[entry()]}
          page={1}
          pageSize={25}
          total={1}
          {...props}
        />
      </div>
    </TooltipProvider>
  );
}

describe('AdminWaitlistTableUnified', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.copyToClipboard.mockResolvedValue(true);
  });

  it('shows a row per entry with its contact, platform, status and date', async () => {
    const { container } = renderTable();
    expect(screen.getByText('Ari Lane')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'ari@example.com' })
    ).toHaveAttribute('href', 'mailto:ari@example.com');
    expect(screen.getByText('@ari')).toBeInTheDocument();
    expect(screen.getByText('Waitlisted')).toBeInTheDocument();
    expect(screen.getByText('Jan 10, 2026')).toBeInTheDocument();
    expect(screen.getByRole('table').getAttribute('data-table-row-mode')).toBe(
      'dense'
    );
    await expectNoA11yViolations(container);
  });

  it('explains the empty waitlist', async () => {
    const { container } = renderTable({ entries: [], total: 0 });
    expect(screen.getByText('No waitlist entries')).toBeInTheDocument();
    expect(
      screen.getByText('New waitlist signups will appear here.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select row 1' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('selects one row and then every row with its own selection state', async () => {
    const user = userEvent.setup();
    renderTable({
      entries: [entry(), entry({ id: 'waitlist_2', fullName: 'Bea' })],
      total: 2,
    });
    const first = screen.getByRole('checkbox', { name: 'Select row 1' });
    await user.click(first);
    expect(
      screen.getByRole('checkbox', { name: 'Select row 1' })
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Select row 2' })
    ).not.toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'Select All Rows' }));
    expect(
      screen.getByRole('checkbox', { name: 'Select row 2' })
    ).toBeChecked();
  });

  it('defers to the parent selection when one is passed', async () => {
    const user = userEvent.setup();
    const toggleSelect = vi.fn();
    const toggleSelectAll = vi.fn();
    renderTable({
      externalSelection: {
        selectedIds: new Set(['waitlist_1']),
        headerCheckboxState: true,
        toggleSelect,
        toggleSelectAll,
      },
    });
    const row = screen.getByRole('checkbox', { name: 'Select row 1' });
    expect(row).toBeChecked();
    await user.click(row);
    expect(toggleSelect).toHaveBeenCalledWith('waitlist_1');
    await user.click(screen.getByRole('checkbox', { name: 'Select All Rows' }));
    expect(toggleSelectAll).toHaveBeenCalledTimes(1);
  });

  it('copies the email from the row menu and confirms it', async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(
      await screen.findByRole('menuitem', { name: 'Copy Email' })
    );
    expect(mocks.copyToClipboard).toHaveBeenCalledWith('ari@example.com');
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith('email copied', {
        duration: 2000,
      })
    );
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('reports a failed copy as an error toast', async () => {
    const user = userEvent.setup();
    mocks.copyToClipboard.mockResolvedValue(false);
    renderTable();
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(
      await screen.findByRole('menuitem', { name: 'Copy Name' })
    );
    expect(mocks.copyToClipboard).toHaveBeenCalledWith('Ari Lane');
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('Failed to copy name')
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('approves a new entry from the row menu', async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(
      screen.queryByRole('menuitem', { name: 'Resend invite' })
    ).toBeNull();
    await user.click(await screen.findByRole('menuitem', { name: 'Approve' }));
    expect(mocks.approveEntry).toHaveBeenCalledWith({
      id: 'waitlist_1',
      status: 'new',
    });
  });

  it('offers disapprove and resend for an invited entry', async () => {
    const user = userEvent.setup();
    renderTable({ entries: [entry({ status: 'invited' })] });
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(
      await screen.findByRole('menuitem', { name: 'Disapprove' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Resend invite' }));
    expect(mocks.resendInvite).toHaveBeenCalledWith({ id: 'waitlist_1' });
  });

  it('opens the primary social profile from its pill', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    renderTable();
    await user.click(screen.getByRole('button', { name: /Instagram/ }));
    expect(open).toHaveBeenCalledWith('https://instagram.com/ari', '_blank');
    open.mockRestore();
  });

  it('groups rows under status labels when grouping is on', () => {
    renderTable({
      groupingEnabled: true,
      entries: [
        entry({ status: 'invited' }),
        entry({ id: 'waitlist_2', fullName: 'Bea', status: 'claimed' }),
      ],
      total: 2,
    });
    expect(screen.getAllByText('Invited').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Signed up').length).toBeGreaterThan(1);
  });

  it('keeps long values in the row and stays axe clean right to left', async () => {
    const { container } = renderTable(
      {
        entries: [
          entry({
            fullName: LONG_NAME,
            primaryGoal: 'streams',
            spotifyUrlNormalized: 'https://open.spotify.com/artist/ari',
            spotifyArtistName: 'Ari Lane',
            heardAbout:
              'A friend at the label showcase mentioned it after the spring remix package went out',
          }),
        ],
        hasNextPage: true,
        isFetchingNextPage: true,
        onLoadMore: vi.fn(),
      },
      'rtl'
    );
    expect(screen.getByText(LONG_NAME)).toBeInTheDocument();
    expect(screen.getByText('Streams')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Spotify/ })).toBeInTheDocument();
    expect(
      screen.getByText(/A friend at the label showcase mentioned it/)
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
