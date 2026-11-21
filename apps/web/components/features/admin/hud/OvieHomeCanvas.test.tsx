import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeCanvasState } from '@/components/jovie/types';
import { APP_ROUTES } from '@/constants/routes';
import { SUMMER_OPS_CARD_SCHEMA } from '@/lib/ovie/ops-card';
import { emptyDeliverySummary } from '@/lib/ovie/shipping-state/contract';
import { OvieHomeCanvas } from './OvieHomeCanvas';
import { COMPANY_RESPONSES, snapshot } from './OvieHomeCanvas.test-fixtures';

vi.mock('@/components/feedback', () => ({
  toast: Object.assign(vi.fn(), {
    dismiss: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

const readyTiming = vi.hoisted(() => vi.fn());
vi.mock('./useOvieHomeReadyTiming', () => ({
  useOvieHomeReadyTiming: readyTiming,
}));

const panelAlert = vi.hoisted(() => vi.fn());
vi.mock('@/lib/ovie/home/panel-alerts', () => ({
  reportOvieHomePanelError: panelAlert,
}));

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

function renderCanvas(chat?: HomeCanvasState) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <OvieHomeCanvas chat={chat} />
    </QueryClientProvider>
  );
  return {
    ...view,
    rerenderChat: (next: HomeCanvasState) =>
      view.rerender(
        <QueryClientProvider client={client}>
          <OvieHomeCanvas chat={next} />
        </QueryClientProvider>
      ),
  };
}

function renderThenAsk(chat: HomeCanvasState) {
  const view = renderCanvas({ ...chat, messages: [] });
  view.rerenderChat(chat);
  return view;
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
    composerHasIntent: false,
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

describe('OvieHomeCanvas Story First flat', () => {
  const fetchMock = vi.fn();
  let companyResponses: Record<string, unknown>;

  beforeEach(() => {
    readyTiming.mockReset();
    panelAlert.mockReset();
    shipping.data = snapshot();
    companyResponses = { ...COMPANY_RESPONSES };
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (url in companyResponses)
        return new Response(JSON.stringify(companyResponses[url]), {
          status: 200,
        });
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders bottleneck, glance rail, and stage buckets without card chrome', async () => {
    renderCanvas();
    const canvas = await screen.findByTestId('story-first-canvas');
    expect(canvas).toBeVisible();
    expect(canvas).toHaveAttribute('data-melting', 'false');

    const bottleneck = await screen.findByTestId('story-first-bottleneck');
    await vi.waitFor(() =>
      expect(bottleneck).toHaveAttribute('data-tone', 'bad')
    );
    expect(bottleneck).toHaveTextContent('Shipping off target');

    expect(screen.getByTestId('story-first-glance-shipping')).toBeVisible();
    expect(screen.getByTestId('story-first-glance-revenue')).toBeVisible();
    expect(screen.getByTestId('story-first-glance-users')).toBeVisible();

    expect(screen.getByTestId('story-first-stages')).toBeVisible();
    expect(screen.getByTestId('story-first-stage-investigating')).toBeVisible();
    expect(screen.getByTestId('story-first-stages-more')).toHaveAttribute(
      'href',
      APP_ROUTES.ADMIN_SHIPPING
    );

    // Demoted from first fold.
    expect(screen.queryByTestId('home-loop-company')).toBeNull();
    expect(screen.queryByTestId('home-loop-kanban')).toBeNull();
    expect(screen.queryByTestId('home-loop-asks-section')).toBeNull();
    expect(screen.queryByTestId('home-loop-done')).toBeNull();
  });

  it('highlights the lead in-flight row on its stage bucket', async () => {
    renderCanvas();
    await screen.findByTestId('story-first-stage-investigating');
    expect(
      screen.getByTestId('story-first-stage-investigating')
    ).toHaveAttribute('data-highlighted', 'true');
    expect(
      screen.getByTestId('story-first-stage-investigating')
    ).toHaveTextContent('JOV-1');
    expect(
      screen.getByTestId('story-first-stage-investigating')
    ).toHaveTextContent('Blocked task');
  });

  it('melts the board when the composer carries intent', async () => {
    renderCanvas(chatState({ composerHasIntent: true, messages: [] }));
    const canvas = await screen.findByTestId('story-first-canvas');
    expect(canvas).toHaveAttribute('data-melting', 'true');
    expect(screen.getByTestId('story-first-board')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('melts while a turn is streaming', async () => {
    renderCanvas(
      chatState({
        isStreaming: true,
        composerHasIntent: false,
        messages: [
          {
            id: 'u1',
            role: 'user',
            parts: [{ type: 'text', text: 'Status?' }],
          },
        ],
      })
    );
    expect(await screen.findByTestId('story-first-canvas')).toHaveAttribute(
      'data-melting',
      'true'
    );
  });

  it('shows loading stages while shipping state has not arrived', () => {
    shipping.data = undefined;
    renderCanvas();
    expect(screen.getByTestId('story-first-stages')).toBeVisible();
    expect(screen.getByTestId('story-first-bottleneck')).toHaveAttribute(
      'data-tone',
      'loading'
    );
  });

  it('treats an unsynced empty task feed as loading', () => {
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
    expect(screen.getByTestId('story-first-bottleneck')).toBeVisible();
  });

  it.each(['disconnected', 'unauthorized'] as const)(
    'alerts when shipping fails cold (%s)',
    async connection => {
      const base = snapshot();
      shipping.data = {
        ...base,
        view: { ...base.view, connection },
        operationalRequestState: 'error',
        operationalTasks: {
          ...base.operationalTasks,
          syncState: 'syncing',
          tasks: [],
        },
      };
      renderCanvas();
      await vi.waitFor(() =>
        expect(panelAlert).toHaveBeenCalledWith(
          'shipping-loop',
          connection === 'unauthorized'
            ? 'unauthorized'
            : 'operational-tasks-unavailable'
        )
      );
      expect(readyTiming).toHaveBeenCalled();
    }
  );

  it('raises no panel alert when glance and shipping are ready', async () => {
    shipping.data = snapshot();
    renderCanvas();
    await screen.findByTestId('story-first-glance-revenue');
    await vi.waitFor(() => expect(readyTiming).toHaveBeenCalledWith(true));
    expect(panelAlert).not.toHaveBeenCalled();
  });

  it('keeps reconciled tasks visible when a later shipping read fails', async () => {
    const base = snapshot();
    shipping.data = {
      ...base,
      view: { ...base.view, connection: 'disconnected' },
      operationalRequestState: 'error',
    };
    renderCanvas();
    expect(
      await screen.findByTestId('story-first-stage-investigating')
    ).toHaveTextContent('Blocked task');
  });

  it('opens on the Story First board, not an earlier conversation', async () => {
    renderCanvas(chatState());
    await screen.findByTestId('story-first-canvas');
    expect(screen.queryByTestId('home-loop-answer')).toBeNull();
  });

  it('renders the latest turn in place and restores earlier canvas states', async () => {
    const chat = chatState();
    renderThenAsk(chat);
    await screen.findByTestId('story-first-canvas');

    const answer = screen.getByTestId('home-loop-answer');
    expect(answer).toHaveTextContent('Shipping?');
    expect(answer).toHaveTextContent('2 of 2');
    expect(answer).toHaveTextContent('Shipping Now');

    fireEvent.click(screen.getByRole('button', { name: 'Previous Answer' }));
    expect(screen.getByTestId('home-loop-answer')).toHaveTextContent(
      'MRR is up.'
    );
    expect(screen.getByTestId('home-loop-answer')).toHaveTextContent(
      'Monthly Revenue'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Conversation' }));
    expect(chat.onOpenTranscript).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId('home-loop-answer-home'));
    expect(screen.queryByTestId('home-loop-answer')).toBeNull();
  });

  it('reserves the answer slot while a reply streams', async () => {
    renderThenAsk(
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
    expect(await screen.findByTestId('home-loop-answer')).toHaveAttribute(
      'data-state',
      'pending'
    );
  });

  it('does not invent a company metric wall when sources are empty', async () => {
    companyResponses = {
      '/api/hud/metrics': { overview: { financialDataAvailable: false } },
      '/api/admin/hud/founder-funnel?range=7d': { stages: [] },
      '/api/ovie/certifications': { rows: [] },
      '/api/ovie/home/blocker': {
        generatedAt: '2026-11-08T23:00:00.000Z',
        blocker: null,
      },
    };
    shipping.data = {
      ...snapshot(),
      view: { ...snapshot().view, delivery: emptyDeliverySummary() },
      operationalTasks: { ...snapshot().operationalTasks, tasks: [] },
    };
    renderCanvas();
    await screen.findByTestId('story-first-glance-shipping');
    expect(screen.queryByTestId('home-loop-tile-runway')).toBeNull();
    expect(screen.getByTestId('story-first-glance-shipping')).toHaveAttribute(
      'data-tone',
      'neutral'
    );
  });
});
