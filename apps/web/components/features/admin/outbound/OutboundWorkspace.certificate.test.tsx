import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutboundQueue } from '@/lib/outbound/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OutboundWorkspace } from './OutboundWorkspace';
import { outboundFixtureQueue, outboundFixtureRow } from './outbound-fixtures';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  readiness: vi.fn(),
  refetchQueue: vi.fn(),
  refetchReadiness: vi.fn(),
  panels: [] as ReactElement[],
}));

vi.mock('@/lib/queries/useOutboundQuery', () => ({
  useOutboundQueueQuery: mocks.query,
  useOutboundCertificationQuery: () => ({ data: undefined, isLoading: false }),
  useOutboundReadinessQuery: mocks.readiness,
  useOutboundDecisionMutation: () => ({ mutateAsync: vi.fn() }),
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

const LONG_NAME =
  'Aurelia Montgomery-Fitzgerald and the Extraordinarily Long Named Midnight Orchestra';
const ADA = outboundFixtureRow();
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
    refetch: mocks.refetchQueue,
    ...extra,
  });
}

function mockReadiness(extra = {}) {
  mocks.readiness.mockReturnValue({
    data: {
      generatedAt: '2026-10-04T12:00:00Z',
      ready: 1,
      total: 2,
      items: [
        {
          id: 'certifications',
          label: 'Certifications cleared',
          status: 'green',
          detail: 'No people waiting on fact review',
          owner: 'outbound',
          href: null,
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: mocks.refetchReadiness,
    ...extra,
  });
}

function renderWorkspace(dir?: 'rtl') {
  return render(
    <TooltipProvider>
      <div dir={dir}>
        <OutboundWorkspace />
      </div>
    </TooltipProvider>
  );
}

describe('OutboundWorkspace certificate states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.panels.length = 0;
    mockReadiness();
  });

  it('keeps headers and blank counts while the queue loads', async () => {
    mockQueue(undefined, { isLoading: true, isFetching: true });
    const { container } = renderWorkspace();
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0);
    expect(screen.getByTestId('outbound-count-ready')).toBeEmptyDOMElement();
    expect(
      screen.getByRole('button', { name: 'Refresh Outbound' })
    ).toBeDisabled();
    expect(screen.queryByText('Outbound queue unavailable')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('retries the queue from the error a failed or offline request leaves', async () => {
    const user = userEvent.setup();
    mockQueue(undefined, { isError: true });
    const { container } = renderWorkspace();
    expect(
      screen.getByText(
        'The lead inventory could not load. Retry to check again.'
      )
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.refetchQueue).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('names the empty view and follows the view tabs', async () => {
    const user = userEvent.setup();
    mockQueue(outboundFixtureQueue([SENT]));
    const { container } = renderWorkspace();
    expect(screen.getByText('Nobody in Ready to certify')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    const views = screen.getByRole('toolbar', { name: 'Outbound Views' });
    expect(views).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Sent/ }));
    expect(screen.getByText('Cy')).toBeInTheDocument();
    expect(screen.queryByText('Nobody in Ready to certify')).toBeNull();

    await user.click(screen.getByRole('button', { name: /^Held/ }));
    expect(screen.getByText('Nobody in Held')).toBeInTheDocument();
  });

  it('shows the queue with a blank readiness count when readiness is missing', async () => {
    mockQueue(outboundFixtureQueue([ADA]));
    mockReadiness({ data: undefined, isError: true });
    const user = userEvent.setup();
    const { container } = renderWorkspace();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByTestId('outbound-readiness-toggle').textContent).toBe(
      'Readiness '
    );
    await user.click(screen.getByTestId('outbound-readiness-toggle'));
    expect(
      screen.getByText('Readiness could not load. Refresh to try again.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('toggles the readiness checklist and refreshes both requests', async () => {
    const user = userEvent.setup();
    mockQueue(outboundFixtureQueue([ADA]));
    const { container } = renderWorkspace();
    expect(screen.getByTestId('outbound-readiness-toggle')).toHaveTextContent(
      'Readiness 1/2'
    );
    expect(screen.queryByTestId('outbound-readiness')).toBeNull();

    await user.click(screen.getByTestId('outbound-readiness-toggle'));
    expect(screen.getByTestId('outbound-readiness')).toBeInTheDocument();
    expect(screen.getByText('Certifications cleared')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByTestId('outbound-readiness-toggle'));
    expect(screen.queryByTestId('outbound-readiness')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Refresh Outbound' }));
    expect(mocks.refetchQueue).toHaveBeenCalledTimes(1);
    expect(mocks.refetchReadiness).toHaveBeenCalledTimes(1);
  });

  it('selects people for bulk actions and opens one in the rail', async () => {
    const user = userEvent.setup();
    mockQueue(outboundFixtureQueue([ADA]));
    renderWorkspace();
    expect(screen.getByTestId('outbound-bulk-count')).toBeEmptyDOMElement();

    await user.click(screen.getByRole('checkbox', { name: 'Select Ada' }));
    expect(screen.getByTestId('outbound-bulk-count')).toHaveTextContent(
      '1 selected · h hold · r reject'
    );
    await user.click(screen.getByRole('checkbox', { name: 'Select Ada' }));
    expect(screen.getByTestId('outbound-bulk-count')).toBeEmptyDOMElement();

    await user.click(screen.getByText('Ada'));
    const rail = mocks.panels.at(-1) as ReactElement<{
      row: { leadId: string } | null;
    }>;
    expect(rail.props.row?.leadId).toBe(ADA.leadId);
  });

  it('keeps a long name on the row and stays axe clean right to left', async () => {
    mockQueue(
      outboundFixtureQueue([
        outboundFixtureRow({
          name: LONG_NAME,
          handle: 'aurelia-montgomery-fitzgerald-official-account',
          whyNow: 'أصدرت أغنية قبل ٥ أيام',
        }),
      ])
    );
    const { container } = renderWorkspace('rtl');
    expect(screen.getByText(LONG_NAME)).toHaveClass('truncate');
    expect(screen.getByText('أصدرت أغنية قبل ٥ أيام')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
