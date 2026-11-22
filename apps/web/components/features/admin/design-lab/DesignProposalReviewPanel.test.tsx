import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/components/feedback';
import type { DesignProposal } from '@/lib/agent-os/design-lab/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DesignProposalReviewPanel } from './DesignProposalReviewPanel';

vi.mock('@/components/feedback', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
}

function proposal(overrides: Partial<DesignProposal>): DesignProposal {
  return {
    id: 'proposal-1',
    surfaceId: 'ops/taste',
    surfaceName: 'Ovie Taste Inbox',
    proposalText: 'Tighten the rejection copy before shipping.',
    assetRefs: [],
    scoring: { weight: 1, score: 0.91 },
    linearIssueId: 'JOV-1',
    linearIssueUrl: 'https://linear.app/jovie/issue/JOV-1/example',
    status: 'pending',
    createdAt: '2026-09-01T12:00:00.000Z',
    reviewedAt: null,
    reviewer: null,
    reviewNotes: null,
    reviewDecision: null,
    dispatchId: null,
    dayBucket: '2026-09-01',
    ...overrides,
  };
}

describe('DesignProposalReviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads Taste Inbox proposals and removes approved and rejected decisions from pending state', async () => {
    const approveProposal = proposal({ id: 'proposal-approve' });
    const rejectProposal = proposal({
      id: 'proposal-reject',
      surfaceName: 'Ovie Empty State',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          proposals: [approveProposal, rejectProposal],
          fetchedAt: '2026-09-01T12:01:00.000Z',
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          result: { dispatchTriggered: true, linearUpdated: false },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          result: { dispatchTriggered: false, linearUpdated: false },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<DesignProposalReviewPanel />);

    expect(await screen.findByText('Taste Inbox')).toBeInTheDocument();
    const approveCard = await screen.findByTestId(
      'design-proposal-card-proposal-approve'
    );
    const rejectCard = await screen.findByTestId(
      'design-proposal-card-proposal-reject'
    );

    await user.click(
      within(approveCard).getByRole('button', { name: 'Approve' })
    );

    await waitFor(() => {
      expect(
        screen.queryByTestId('design-proposal-card-proposal-approve')
      ).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/admin/design-lab/proposals/proposal-approve/review',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          dayBucket: '2026-09-01',
          decision: 'yes',
          notes: null,
        }),
      })
    );
    expect(toast.success).toHaveBeenCalledWith(
      'Taste proposal approved. Dispatch request accepted; execution is unconfirmed.'
    );
    expect(toast.error).not.toHaveBeenCalled();

    await user.click(
      within(rejectCard).getByRole('button', { name: 'Reject' })
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Reject taste proposal',
    });
    await user.type(
      within(dialog).getByPlaceholderText('Add notes for this decision'),
      'Too busy for this Ovie pass.'
    );
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));

    await waitFor(() => {
      expect(
        screen.queryByTestId('design-proposal-card-proposal-reject')
      ).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/admin/design-lab/proposals/proposal-reject/review',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          dayBucket: '2026-09-01',
          decision: 'no',
          notes: 'Too busy for this Ovie pass.',
        }),
      })
    );
    expect(screen.getByText('No pending taste proposals.')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(
      'Linear issue status could not be updated.'
    );
  });

  it('reports unconfirmed dispatch separately from a saved approval', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ proposals: [proposal({})] }))
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          result: { dispatchTriggered: false, linearUpdated: false },
        })
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<DesignProposalReviewPanel />);

    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Taste proposal approved. Dispatch could not be confirmed.'
      );
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByText('No pending taste proposals.')).toBeInTheDocument();
  });

  it('renders the empty inbox when the payload omits the proposals array', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    render(<DesignProposalReviewPanel />);

    expect(
      await screen.findByText('No pending taste proposals.')
    ).toBeInTheDocument();
  });

  it('renders an actionable authorization failure instead of an empty inbox', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error:
              'Reverify with an admin Ovie account to load the Taste Inbox.',
            code: 'ovie_taste_inbox_forbidden',
            action: 'reverify_admin',
          },
          { status: 403 }
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          proposals: [],
          fetchedAt: '2026-09-01T12:02:00.000Z',
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<DesignProposalReviewPanel />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Admin Access Required');
    expect(alert).toHaveTextContent('Reverify with an admin Ovie account');
    expect(
      screen.queryByText('No pending taste proposals.')
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry Taste Inbox' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText('No pending taste proposals.')
    ).toBeInTheDocument();
  });

  it('shows an actionable review error when a failed review returns non-JSON', async () => {
    const approveProposal = proposal({ id: 'proposal-approve' });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          proposals: [approveProposal],
          fetchedAt: '2026-09-01T12:01:00.000Z',
        })
      )
      .mockResolvedValueOnce(
        new Response('<html>proxy failure</html>', {
          status: 500,
          headers: { 'content-type': 'text/html' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<DesignProposalReviewPanel />);

    const approveCard = await screen.findByTestId(
      'design-proposal-card-proposal-approve'
    );
    await user.click(
      within(approveCard).getByRole('button', { name: 'Approve' })
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Review failed (500)');
    });
    expect(
      screen.getByTestId('design-proposal-card-proposal-approve')
    ).toBeInTheDocument();
  });

  it('keeps typed notes and focus in the notes dialog, drawn by the Textarea atom', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({ proposals: [proposal({})], fetchedAt: 'now' })
        )
    );
    render(<DesignProposalReviewPanel />);

    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Reject taste proposal',
    });
    const notes = within(dialog).getByRole('textbox', {
      name: 'Decision Notes',
    });
    await user.type(notes, 'Too busy');
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    await user.click(notes);

    expect(notes).toHaveValue('Too busy');
    expect(notes).toHaveFocus();
    expect(notes.className).toContain('border-subtle');
    expect(dialog.className).toContain('bg-ink-on-media/40');
    await expectNoA11yViolations(dialog);
  });

  it('has no accessibility violations with a proposal and with an empty inbox', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({ proposals: [proposal({})], fetchedAt: 'now' })
        )
    );
    const { container, unmount } = render(<DesignProposalReviewPanel />);
    await screen.findByTestId('design-proposal-card-proposal-1');
    await expectNoA11yViolations(container);
    unmount();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({})));
    const empty = render(<DesignProposalReviewPanel />);
    await screen.findByText('No pending taste proposals.');
    await expectNoA11yViolations(empty.container);
  });
});
