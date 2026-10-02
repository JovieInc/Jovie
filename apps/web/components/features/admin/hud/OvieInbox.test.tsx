import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OvieInboxCase } from '@/lib/ovie/inbox';
import { OvieInbox } from './OvieInbox';

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
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <OvieInbox />
    </QueryClientProvider>
  );
}
const response = (cases: readonly OvieInboxCase[]) =>
  new Response(JSON.stringify({ cases, issues: [] }), { status: 200 });
afterEach(() => vi.unstubAllGlobals());

describe('Ovie Inbox', () => {
  it('shows one decision and advances only after a successful receipt', async () => {
    const second = {
      ...item,
      id: 'summer:two',
      title: 'Second decision',
      decisionTarget: { kind: 'summer' as const, id: 'two' },
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response([item, second]))
      .mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(response([second]));
    vi.stubGlobal('fetch', fetcher);
    mount();
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
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response([item]))
        .mockResolvedValueOnce(new Response('{}', { status: 503 }))
    );
    mount();
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
  });
  it('does not carry old notes onto a new decision after a conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response([item]))
        .mockResolvedValueOnce(new Response('{}', { status: 409 }))
        .mockResolvedValueOnce(
          response([{ ...item, id: 'new', title: 'New decision' }])
        )
    );
    mount();
    await screen.findByText('First decision');
    fireEvent.change(screen.getByLabelText('Decision notes'), {
      target: { value: 'Original notes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await screen.findByText('New decision');
    expect(screen.getByLabelText('Decision notes')).toHaveValue('');
  });
  it('distinguishes a failed read from an empty inbox and supports retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('{}', { status: 503 }))
        .mockResolvedValueOnce(response([]))
    );
    mount();
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
