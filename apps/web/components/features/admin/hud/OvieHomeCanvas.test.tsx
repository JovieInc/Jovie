import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_LOOP_UNDO_WINDOW_MS } from '@/components/organisms/home-loop/useUndoableAnswers';
import type { OvieInbox } from '@/lib/ovie/inbox';
import { INTERACTION_CASE_CONTRACT } from '@/lib/ovie/interaction-case';
import { emptyDeliverySummary } from '@/lib/ovie/shipping-state/contract';
import { OvieHomeCanvas } from './OvieHomeCanvas';

vi.mock('@/components/feedback', () => ({ toast: vi.fn() }));

const shipping = vi.hoisted(() => ({
  data: undefined as unknown,
  refetch: vi.fn(),
}));
vi.mock('./useHudShippingStateQuery', () => ({
  useHudShippingStateQuery: () =>
    shipping.data
      ? {
          ...(shipping.data as object),
          isPending: false,
          isFetching: false,
          refetch: shipping.refetch,
        }
      : { isPending: true, isFetching: true, refetch: shipping.refetch },
}));

const INBOX: OvieInbox = {
  issues: [],
  cases: [
    {
      contract: INTERACTION_CASE_CONTRACT,
      id: 'summer:card-1',
      kind: 'spend',
      source: { system: 'summer', id: 'card-1', revision: null },
      title: 'Vercel on-demand concurrency',
      recommendation: 'Approve about $6 a month',
      owner: null,
      state: 'needs_you',
      priority: 1,
      createdAt: '2026-10-20T18:00:00.000Z',
      nextAction: null,
      waitingUntil: null,
      confidence: null,
      evidence: [],
      body: 'Preview floods stalled production for five hours.',
      decisionTarget: { kind: 'summer', id: 'card-1' },
    },
  ],
};

function snapshot() {
  const delivery = emptyDeliverySummary();
  return {
    operationalRequestState: 'idle',
    view: {
      connection: 'connected',
      delivery: {
        ...delivery,
        merges: {
          ...delivery.merges,
          since: '2026-10-20T07:00:00.000Z',
          today: { state: 'measured-nonzero', value: 3 },
        },
      },
    },
    operationalTasks: {
      canonicalSource: 'linear',
      cacheMode: 'local-reconciled',
      syncState: 'fresh',
      sourceId: 'lane-pull-requests',
      observedAt: null,
      lastSyncedAt: null,
      freshnessDeadline: null,
      deltas: [],
      tasks: [
        {
          id: 'linear:JOV-1',
          linearIdentifier: 'JOV-1',
          linearUrl: null,
          title: 'Blocked task',
          workflowState: 'blocked',
          priority: 'high',
          attempt: null,
          retryAt: null,
          sourceRevision: null,
          updatedAt: '2026-10-20T18:00:00.000Z',
          pullRequest: null,
        },
      ],
    },
  };
}

function renderCanvas() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OvieHomeCanvas />
    </QueryClientProvider>
  );
}

describe('OvieHomeCanvas', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    shipping.data = snapshot();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/ovie/inbox')
        return new Response(JSON.stringify(INBOX), { status: 200 });
      if (init?.method === 'POST')
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders the company loop from shipping state and the inbox', async () => {
    renderCanvas();
    expect(
      await screen.findByText('Vercel on-demand concurrency')
    ).toBeVisible();
    expect(screen.getByTestId('home-loop-constraint')).toHaveTextContent(
      '1 item is blocked'
    );
    expect(screen.getByTestId('home-loop-done')).toHaveTextContent('3 merges');
    expect(screen.getByTestId('home-loop-stage-row')).toHaveAttribute(
      'data-attention',
      'blocked'
    );
  });

  it('shows loading while shipping state has not arrived', () => {
    shipping.data = undefined;
    renderCanvas();
    expect(screen.getByTestId('home-loop-in-flight-section')).toHaveAttribute(
      'data-state',
      'loading'
    );
  });

  it('treats an unsynced, empty task feed as loading rather than empty', () => {
    const base = snapshot();
    shipping.data = {
      ...base,
      operationalTasks: {
        ...base.operationalTasks,
        syncState: 'syncing',
        observedAt: null,
        tasks: [],
      },
    };
    renderCanvas();
    expect(screen.getByTestId('home-loop-in-flight-section')).toHaveAttribute(
      'data-state',
      'loading'
    );
  });

  it('records an approval only after the undo window closes', async () => {
    renderCanvas();
    const approve = await screen.findByTestId('home-loop-ask-approve');
    vi.useFakeTimers();
    fireEvent.click(approve);
    expect(
      within(screen.getByTestId('home-loop-ask')).getByRole('status')
    ).toHaveTextContent('Approved');
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/decision'),
      expect.anything()
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(HOME_LOOP_UNDO_WINDOW_MS);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ovie/summer-cards/card-1/decision',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
