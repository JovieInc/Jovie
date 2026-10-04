import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutboundQueue } from '@/lib/outbound/types';
import { OutboundWorkspace } from './OutboundWorkspace';
import { outboundFixtureQueue, outboundFixtureRow } from './outbound-fixtures';
import { OUTBOUND_RAIL_COMMAND_EVENT } from './outbound-keys';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  decide: vi.fn(),
  panels: [] as ReactElement[],
}));

vi.mock('@/lib/queries/useOutboundQuery', () => ({
  useOutboundQueueQuery: mocks.query,
  useOutboundCertificationQuery: () => ({ data: undefined, isLoading: false }),
  useOutboundDecisionMutation: () => ({ mutateAsync: mocks.decide }),
  useOutboundFactReviewMutation: () => ({ mutateAsync: vi.fn() }),
  useOutboundRefreshEvidenceMutation: () => ({ mutateAsync: vi.fn() }),
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.panels.length = 0;
    mocks.decide.mockResolvedValue({ ok: true });
  });

  it('defaults to Ready to certify with ranked people and view counts', () => {
    mockQueue(outboundFixtureQueue([ADA, BEA, SENT]));
    renderWorkspace();
    expect(screen.getByTestId('outbound-count-ready')).toHaveTextContent('2');
    expect(screen.getByTestId('outbound-count-sent')).toHaveTextContent('1');
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Bea')).toBeInTheDocument();
    expect(screen.queryByText('Cy')).toBeNull();
    expect(screen.getAllByText('Profile built 188 days ago')).toHaveLength(2);
  });

  it('shows a retryable error state', () => {
    mockQueue(undefined, { isError: true });
    renderWorkspace();
    expect(screen.getByText('Outbound queue unavailable')).toBeInTheDocument();
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Review Facts' })[1]);
    const rail = mocks.panels.at(-1) as ReactElement<{
      row: { leadId: string } | null;
    }>;
    expect(rail.props.row?.leadId).toBe(BEA.leadId);
    expect(screen.getAllByText('Not scored').length).toBeGreaterThan(0);
  });
});
