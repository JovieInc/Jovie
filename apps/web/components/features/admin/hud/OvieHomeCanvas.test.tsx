import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeCanvasState } from '@/components/jovie/types';
import { HOME_LOOP_UNDO_WINDOW_MS } from '@/components/organisms/home-loop/useUndoableAnswers';
import type { OvieInbox } from '@/lib/ovie/inbox';
import { INTERACTION_CASE_CONTRACT } from '@/lib/ovie/interaction-case';
import { SUMMER_OPS_CARD_SCHEMA } from '@/lib/ovie/ops-card';
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

function renderCanvas(chat?: HomeCanvasState) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OvieHomeCanvas chat={chat} />
    </QueryClientProvider>
  );
}

function opsCard(kind: 'shipping' | 'revenue', title: string) {
  return {
    card: {
      schema: SUMMER_OPS_CARD_SCHEMA,
      kind,
      title,
      state: 'fresh',
      observedAt: '2026-10-20T18:00:00.000Z',
      facts: [{ label: 'Value', value: '12' }],
    },
  };
}

function chatState(overrides: Partial<HomeCanvasState> = {}): HomeCanvasState {
  return {
    isStreaming: false,
    onOpenTranscript: vi.fn(),
    messages: [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Revenue?' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'MRR is up.' },
          {
            type: 'tool-summerOpsData',
            toolCallId: 't1',
            state: 'output-available',
            input: {},
            output: opsCard('revenue', 'Monthly Revenue'),
          },
        ],
      },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Shipping?' }] },
      {
        id: 'a2',
        role: 'assistant',
        parts: [
          {
            type: 'tool-summerOpsData',
            toolCallId: 't2',
            state: 'output-available',
            input: {},
            output: opsCard('shipping', 'Shipping Now'),
          },
        ],
      },
    ],
    ...overrides,
  };
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

  it('renders the latest turn in place and restores earlier canvas states', async () => {
    const chat = chatState();
    renderCanvas(chat);
    await screen.findByText('Vercel on-demand concurrency');

    const answer = screen.getByTestId('home-loop-answer');
    expect(answer).toHaveTextContent('Shipping?');
    expect(answer).toHaveTextContent('2 of 2');
    // Shipping cards update the in-flight section in place.
    expect(
      screen.getByTestId('home-loop-in-flight-generated')
    ).toHaveTextContent('Shipping Now');
    expect(screen.queryByTestId('home-loop-stage-row')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Previous Answer' }));
    expect(screen.getByTestId('home-loop-answer')).toHaveTextContent(
      'MRR is up.'
    );
    expect(screen.getByTestId('home-loop-answer')).toHaveTextContent(
      'Monthly Revenue'
    );
    expect(screen.getByTestId('home-loop-stage-row')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Open Conversation' }));
    expect(chat.onOpenTranscript).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId('home-loop-answer-home'));
    expect(screen.queryByTestId('home-loop-answer')).toBeNull();
  });

  it('reserves the answer slot while a reply streams', async () => {
    renderCanvas(
      chatState({
        isStreaming: true,
        messages: [
          {
            id: 'u1',
            role: 'user',
            parts: [{ type: 'text', text: 'Status?' }],
          },
        ],
      })
    );
    await screen.findByText('Vercel on-demand concurrency');
    expect(screen.getByTestId('home-loop-answer')).toHaveAttribute(
      'data-state',
      'pending'
    );
    expect(screen.getByTestId('home-loop-answer-pending')).toBeVisible();
  });
});
