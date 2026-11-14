import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutboundQueue } from '@/lib/outbound/types';
import { OutboundWorkspace } from './OutboundWorkspace';
import { outboundFixtureQueue, outboundFixtureRow } from './outbound-fixtures';
import { OUTBOUND_RAIL_COMMAND_EVENT } from './outbound-keys';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  decide: vi.fn(),
  refreshEvidence: vi.fn(),
  panels: [] as ReactElement[],
}));

vi.mock('@/lib/queries/useOutboundQuery', () => ({
  useOutboundQueueQuery: mocks.query,
  useOutboundCertificationQuery: () => ({ data: undefined, isLoading: false }),
  useOutboundReadinessQuery: () => ({
    data: { generatedAt: '', ready: 1, total: 6, items: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useOutboundDecisionMutation: () => ({ mutateAsync: mocks.decide }),
  useOutboundFactReviewMutation: () => ({ mutateAsync: vi.fn() }),
  useOutboundRefreshEvidenceMutation: () => ({
    mutateAsync: mocks.refreshEvidence,
  }),
  getOutboundDecisionErrorMessage: () => 'refused',
}));
vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: (panel: ReactElement) => {
    mocks.panels.push(panel);
  },
}));
vi.mock('@/components/feedback', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const ADA = outboundFixtureRow();
const BEA = outboundFixtureRow({
  leadId: '00000000-0000-4000-8000-000000000002',
  name: 'Bea',
  handle: 'bea',
  rank: 2,
  approval: { ...ADA.approval, targetRevision: 'b'.repeat(64) },
});
const SENT = outboundFixtureRow({
  leadId: '00000000-0000-4000-8000-000000000003',
  name: 'Cy',
  handle: 'cy',
  view: 'sent',
  nextAction: 'await_reply',
});

function mockQueue(data: OutboundQueue | undefined, extra = {}) {
  mocks.query.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    ...extra,
  });
}

function renderWorkspace() {
  return render(
    <TooltipProvider>
      <OutboundWorkspace />
    </TooltipProvider>
  );
}

describe('OutboundWorkspace', () => {
  it('keeps table headers through loading and shows one quiet empty line', () => {
    mockQueue(undefined, { isLoading: true });
    const { container, rerender } = renderWorkspace();
    const headers = screen.getAllByRole('columnheader');
    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length
    ).toBeGreaterThan(0);
    const loadingCells = container.querySelectorAll('tbody tr:first-child td');
    expect(
      loadingCells[0]?.querySelector('.system-b-table-skeleton-person-face')
    ).toBeNull();
    expect(
      loadingCells[1]?.querySelector('.system-b-table-skeleton-person-face')
    ).not.toBeNull();
    mockQueue(outboundFixtureQueue([]));
    rerender(
      <TooltipProvider>
        <OutboundWorkspace />
      </TooltipProvider>
    );
    expect(screen.getAllByRole('columnheader')).toEqual(headers);
    expect(screen.getByText('Nobody in Ready to certify')).toBeInTheDocument();
    expect(container.querySelector('[data-empty-state-card]')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Review / })).toBeNull();
    expect(mocks.decide).not.toHaveBeenCalled();
    expect(mocks.refreshEvidence).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.panels.length = 0;
    mocks.decide.mockResolvedValue({ ok: true });
  });

  it('defaults to Ready to certify with ranked people and view counts', () => {
    mockQueue(outboundFixtureQueue([ADA, BEA, SENT]));
    renderWorkspace();
    expect(
      screen.getByRole('button', { name: 'Ready to certify 2' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'Needs evidence 0' })
    ).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Bea')).toBeInTheDocument();
    expect(screen.queryByText('Cy')).toBeNull();
    expect(screen.getAllByText('Released 5 days ago')).toHaveLength(2);
  });

  it('explicitly marks an absent trigger and flags non-artists', () => {
    mockQueue(
      outboundFixtureQueue([
        outboundFixtureRow({
          leadId: 'z',
          name: 'Curator',
          handle: 'spotifyplaylistcurator',
          view: 'ready',
          whyNow: null,
          fit: 'unknown',
          fitBasis: 'presence_only',
          flags: ['possible_non_artist', 'presence_only_fit'],
          entityNote: 'Looks like a playlist curator or submission service',
        }),
      ])
    );
    renderWorkspace();
    expect(screen.getByRole('img', { name: 'No trigger' })).toBeInTheDocument();
    expect(screen.getByText('Presence only')).toBeInTheDocument();
    expect(screen.getByTestId('outbound-flag-non-artist')).toHaveTextContent(
      'Possible non-artist'
    );
    expect(
      screen.getByRole('button', { name: 'Needs evidence 0' })
    ).toHaveTextContent('0');
  });

  it('labels a held existing relationship and tags a noted one', async () => {
    const user = userEvent.setup();
    mockQueue(
      outboundFixtureQueue([
        outboundFixtureRow({
          leadId: 'n',
          name: 'Nova Lane',
          handle: 'novalane',
          view: 'ready',
          relationshipNotes: [
            "Relationship: Armada Music, Tim's vocalist deals",
          ],
        }),
        outboundFixtureRow({
          leadId: 'd',
          name: 'Dannic',
          handle: 'djdannic',
          view: 'held',
          flags: ['existing_relationship'],
          relationshipHold:
            'Existing relationship: flag to Tim, no cold outreach',
          message: null,
        }),
      ])
    );
    renderWorkspace();
    // The noted artist stays in Ready to certify, with the tag on the row.
    expect(
      screen.getByRole('button', { name: 'Ready to certify 1' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('outbound-relationship-note')).toHaveTextContent(
      "Relationship: Armada Music, Tim's vocalist deals"
    );
    // The held artist is not offered in Ready to certify.
    expect(screen.queryByText('Dannic')).toBeNull();
    expect(
      screen.queryByTestId('outbound-flag-existing-relationship')
    ).toBeNull();
    await user.click(
      screen.getByRole('button', { name: /All Outbound views/ })
    );
    await user.click(screen.getByRole('menuitemradio', { name: 'Held 1' }));
    expect(screen.getByText('Dannic')).toBeInTheDocument();
    expect(
      screen.getByTestId('outbound-flag-existing-relationship')
    ).toHaveAttribute(
      'title',
      'Existing relationship: flag to Tim, no cold outreach'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review Dannic' }));
    expect(mocks.decide).not.toHaveBeenCalled();
    expect(mocks.refreshEvidence).not.toHaveBeenCalled();
    expect(
      (
        mocks.panels.at(-1) as ReactElement<{
          row: { relationshipHold: string };
        }>
      ).props.row.relationshipHold
    ).toBe('Existing relationship: flag to Tim, no cold outreach');
  });

  it('shows a retryable error state', () => {
    const refetch = vi.fn();
    mockQueue(undefined, { isError: true, refetch });
    renderWorkspace();
    expect(screen.getByText('Outbound queue unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Review / })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(mocks.decide).not.toHaveBeenCalled();
    expect(mocks.refreshEvidence).not.toHaveBeenCalled();
  });

  it('explains unknown markers once and keeps the no-auto-send explanation outside shortcuts', () => {
    mockQueue(outboundFixtureQueue([ADA, BEA]));
    renderWorkspace();
    expect(screen.getByText('Not scored or no trigger')).toBeInTheDocument();
    const shortcuts = screen.getByText('Keyboard shortcuts').closest('details');
    expect(shortcuts).not.toHaveAttribute('open');
    const safety = screen.getByText(
      'Approving records your decision; nothing sends automatically.'
    );
    expect(safety.closest('details')).toBeNull();
    expect(screen.getAllByRole('img', { name: 'Not scored' })).toHaveLength(4);
  });

  it('labels rail navigation as Review without dispatching the suggested action', () => {
    const row = outboundFixtureRow({ nextAction: 'gather_evidence' });
    mockQueue(outboundFixtureQueue([row]));
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Review Ada' }));
    expect(mocks.decide).not.toHaveBeenCalled();
    expect(mocks.refreshEvidence).not.toHaveBeenCalled();
    expect(
      (mocks.panels.at(-1) as ReactElement<{ row: typeof row }>).props.row
    ).toBe(row);
  });

  it('holds every selected person in bulk, one decision per person', () => {
    mockQueue(outboundFixtureQueue([ADA, BEA]));
    renderWorkspace();
    fireEvent.click(screen.getByLabelText('Select Ada'));
    fireEvent.click(screen.getByLabelText('Select Bea'));
    fireEvent.keyDown(window, { key: 'h' });
    expect(mocks.decide).toHaveBeenCalledWith({
      action: 'hold',
      items: [
        {
          leadId: ADA.leadId,
          expectedTargetRevision: ADA.approval.targetRevision,
        },
        {
          leadId: BEA.leadId,
          expectedTargetRevision: BEA.approval.targetRevision,
        },
      ],
    });
  });

  it('never approves from the table; a only asks the rail to approve what it shows', () => {
    mockQueue(outboundFixtureQueue([ADA, BEA]));
    renderWorkspace();
    const commands: string[] = [];
    const listener = (event: Event) =>
      commands.push((event as CustomEvent<string>).detail);
    window.addEventListener(OUTBOUND_RAIL_COMMAND_EVENT, listener);
    fireEvent.click(screen.getByLabelText('Select Ada'));
    fireEvent.click(screen.getByLabelText('Select Bea'));
    fireEvent.keyDown(window, { key: 'a' });
    window.removeEventListener(OUTBOUND_RAIL_COMMAND_EVENT, listener);
    expect(commands).toEqual(['approve']);
    expect(mocks.decide).not.toHaveBeenCalled();
    expect(mocks.refreshEvidence).not.toHaveBeenCalled();
  });

  it('moves through people with j and k', () => {
    mockQueue(outboundFixtureQueue([ADA, BEA]));
    renderWorkspace();
    fireEvent.keyDown(window, { key: 'j' });
    expect(
      (mocks.panels.at(-1) as ReactElement<{ row: { leadId: string } | null }>)
        .props.row?.leadId
    ).toBe(ADA.leadId);
    fireEvent.keyDown(window, { key: 'j' });
    const rail = mocks.panels.at(-1) as ReactElement<{
      row: { leadId: string } | null;
    }>;
    expect(rail.props.row?.leadId).toBe(BEA.leadId);
  });

  it('shows the next action as a button that opens the person', () => {
    mockQueue(outboundFixtureQueue([ADA, BEA]));
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Review Bea' }));
    const rail = mocks.panels.at(-1) as ReactElement<{
      row: { leadId: string } | null;
    }>;
    expect(rail.props.row?.leadId).toBe(BEA.leadId);
    expect(
      screen.getAllByRole('img', { name: 'Not scored' }).length
    ).toBeGreaterThan(0);
  });

  it.each([
    ['build_profile', 'Build profile'],
    ['gather_evidence', 'Gather evidence'],
    ['check_entity', 'Check entity'],
    ['review_facts', 'Review facts'],
    ['approve_message', 'Approve message'],
    ['send', 'Ready to send'],
  ] as const)(
    'keeps %s as navigation with the full imported identity',
    (nextAction, label) => {
      const row = outboundFixtureRow({
        name: 'Ada — Listen on YouTube, Spotify, Apple Music',
        nextAction,
      });
      mockQueue(outboundFixtureQueue([row]));
      renderWorkspace();
      expect(screen.getByTitle(row.name)).toHaveTextContent(row.name);
      const review = screen.getByRole('button', { name: `Review ${row.name}` });
      expect(review).toHaveAttribute(
        'title',
        `Open review. Suggested next step: ${label}.`
      );
      fireEvent.click(review);
      const rail = mocks.panels.at(-1) as ReactElement<{
        row: { leadId: string; name: string } | null;
      }>;
      expect(rail.props.row).toMatchObject({
        leadId: row.leadId,
        name: row.name,
      });
      expect(mocks.decide).not.toHaveBeenCalled();
      expect(mocks.refreshEvidence).not.toHaveBeenCalled();
    }
  );
});
