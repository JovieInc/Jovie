import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OvieInboxCase } from '@/lib/ovie/inbox';
import { OvieInbox } from './OvieInbox';

vi.mock(
  '@/components/features/opportunity-inbox/FounderReviewRecorder',
  () => ({
    FounderReviewRecorder: ({ target }: { target: { sourceKind: string } }) => (
      <div data-testid='operator-note-capture'>{target.sourceKind}</div>
    ),
  })
);

const item: OvieInboxCase = {
  contract: 'jovie.interaction-case/v1',
  id: 'summer:one',
  kind: 'spend',
  source: { system: 'summer', id: 'one', revision: null },
  title: 'First decision',
  body: 'Exact proposal',
  recommendation: 'Use owned capacity',
  owner: 'founder',
  state: 'needs_you',
  priority: 1,
  createdAt: '2026-10-02T00:00:00Z',
  nextAction: 'Review',
  waitingUntil: null,
  confidence: null,
  evidence: [],
  decisionTarget: { kind: 'summer', id: 'one' },
};
function mount(...responses: Response[]) {
  return mountRequested(undefined, ...responses);
}
function mountRequested(caseId: string | undefined, ...responses: Response[]) {
  const fetcher = vi.fn();
  for (const response of responses) fetcher.mockResolvedValueOnce(response);
  vi.stubGlobal('fetch', fetcher);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <OvieInbox caseId={caseId} />
    </QueryClientProvider>
  );
  return fetcher;
}
const response = (cases: readonly OvieInboxCase[]) =>
  new Response(JSON.stringify({ cases, issues: [] }), { status: 200 });
afterEach(() => vi.unstubAllGlobals());

describe('Ovie Inbox', () => {
  it('opens the requested current case beyond 50 others without deciding any case', async () => {
    const earlier = Array.from({ length: 76 }, (_, index) => ({
      ...item,
      id: `summer:earlier-${index}`,
      title: `Earlier decision ${index}`,
    }));
    const fetcher = mountRequested(item.id, response([...earlier, item]));
    await screen.findByText('First decision');
    expect(screen.queryByText('Earlier decision 0')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('ovie-inbox-decision')).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty('method', 'POST');
  });
  it.each(['summer:missing', ''])(
    'does not substitute another case for a missing requested case %j',
    async caseId => {
      const fetcher = mountRequested(caseId, response([item]));
      await screen.findByText(
        'This decision is not in the current inbox. Refresh to check its status.'
      );
      expect(
        screen.queryByTestId('ovie-inbox-decision')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Approve' })
      ).not.toBeInTheDocument();
      expect(fetcher).toHaveBeenCalledOnce();
    }
  );
  it('keeps a missing requested case non-actionable when a source is unavailable', async () => {
    mountRequested(
      item.id,
      new Response(
        JSON.stringify({ cases: [], issues: ['Summer is unavailable.'] }),
        { status: 200 }
      )
    );
    await screen.findByText(
      'This decision is not in the current inbox. Refresh to check its status.'
    );
    expect(
      screen.getByText(/Some sources are unavailable/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Approve' })
    ).not.toBeInTheDocument();
  });
  it('keeps the requested case and its notes across a reordered refresh', async () => {
    const other = { ...item, id: 'summer:other', title: 'Other decision' };
    mountRequested(item.id, response([item, other]), response([other, item]));
    await screen.findByText('First decision');
    fireEvent.change(screen.getByLabelText('Decision notes'), {
      target: { value: 'Check this scope' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
    );
    expect(screen.getByText('First decision')).toBeInTheDocument();
    expect(screen.queryByText('Other decision')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Decision notes')).toHaveValue(
      'Check this scope'
    );
  });
  it.each([200, 409])(
    'never advances a requested case to another actionable card after response %s',
    async status => {
      const other = { ...item, id: 'summer:other', title: 'Other decision' };
      const fetcher = mountRequested(
        item.id,
        response([other, item]),
        new Response('{}', { status }),
        response([other])
      );
      await screen.findByText('First decision');
      fireEvent.change(screen.getByLabelText('Decision notes'), {
        target: { value: 'Hold for scope correction' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
      await screen.findByText(
        'This decision is not in the current inbox. Refresh to check its status.'
      );
      expect(fetcher.mock.calls[1]?.[0]).toBe(
        '/api/ovie/summer-cards/one/decision'
      );
      expect(screen.queryByText('Other decision')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Approve' })
      ).not.toBeInTheDocument();
    }
  );
  it('retains requested-case selection after a failed read and retry', async () => {
    mountRequested(
      item.id,
      new Response('{}', { status: 503 }),
      response([{ ...item, id: 'summer:other', title: 'Other decision' }, item])
    );
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('First decision');
    expect(screen.queryByText('Other decision')).not.toBeInTheDocument();
  });
  it('shows one decision and advances only after a successful receipt', async () => {
    const second = {
      ...item,
      id: 'summer:two',
      title: 'Second decision',
      decisionTarget: { kind: 'summer' as const, id: 'two' },
    };
    const fetcher = mount(
      response([item, second]),
      new Response('{}'),
      response([second])
    );
    await screen.findByText('First decision');
    expect(screen.queryByText('Second decision')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('ovie-inbox-decision')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await screen.findByText('Second decision');
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      '/api/ovie/summer-cards/one/decision'
    );
    expect(screen.queryByText('First decision')).not.toBeInTheDocument();
  });
  it('preserves notes and current decision when submission fails', async () => {
    mount(response([item]), new Response('{}', { status: 503 }));
    await screen.findByText('First decision');
    fireEvent.change(screen.getByLabelText('Decision notes'), {
      target: { value: 'Do not buy this' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Decision notes')).toHaveValue(
      'Do not buy this'
    );
    expect(screen.getByText('First decision')).toBeInTheDocument();
    expect(
      screen.queryByTestId('operator-note-capture')
    ).not.toBeInTheDocument();
    const disclosure = screen.getByText('Capture A Note').closest('details')!;
    disclosure.open = true;
    fireEvent(disclosure, new Event('toggle'));
    expect(screen.getByTestId('operator-note-capture')).toHaveTextContent(
      'founder.brain_dump'
    );
  });
  it('does not carry old notes onto a new decision after a conflict', async () => {
    mount(
      response([item]),
      new Response('{}', { status: 409 }),
      response([{ ...item, id: 'new', title: 'New decision' }])
    );
    await screen.findByText('First decision');
    fireEvent.change(screen.getByLabelText('Decision notes'), {
      target: { value: 'Original notes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await screen.findByText('New decision');
    expect(screen.getByLabelText('Decision notes')).toHaveValue('');
  });
  it('distinguishes a failed read from an empty inbox and supports retry', async () => {
    mount(new Response('{}', { status: 503 }), response([]));
    await screen.findByRole('alert');
    expect(
      screen.queryByText('No pending founder decisions.')
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(
        screen.getByText('No pending founder decisions.')
      ).toBeInTheDocument()
    );
  });
});
