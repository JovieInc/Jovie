import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeCanvasState } from '@/components/jovie/types';
import { mockFitLayout } from '@/components/organisms/home-loop/fit-layout.test-utils';
import { HOME_LOOP_UNDO_WINDOW_MS } from '@/components/organisms/home-loop/useUndoableAnswers';
import { APP_ROUTES } from '@/constants/routes';
import type { OvieInbox } from '@/lib/ovie/inbox';
import { INTERACTION_CASE_CONTRACT } from '@/lib/ovie/interaction-case';
import { SUMMER_OPS_CARD_SCHEMA } from '@/lib/ovie/ops-card';
import { emptyDeliverySummary } from '@/lib/ovie/shipping-state/contract';
import { OvieHomeCanvas } from './OvieHomeCanvas';

const toastMock = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    dismiss: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  })
);
vi.mock('@/components/feedback', () => ({ toast: toastMock }));

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

/** Home opens on the company loop; turns asked this session render in place. */
function renderThenAsk(chat: HomeCanvasState) {
  const view = renderCanvas({ ...chat, messages: [] });
  view.rerenderChat(chat);
  return view;
}

const COMPANY_RESPONSES: Record<string, unknown> = {
  '/api/hud/metrics': {
    overview: {
      mrrUsd: 0,
      activeSubscribers: 0,
      balanceUsd: 22.96,
      burnRateUsd: 110,
      runwayMonths: 0.2,
      defaultStatus: 'dead',
      defaultStatusDetail: '',
      financialDataAvailable: true,
      weekAgo: { mrrUsd: 0, activeSubscribers: 0 },
    },
  },
  '/api/admin/hud/founder-funnel?range=7d': {
    stages: [{ key: 'accounts_created', count: 2, drillDownHref: null }],
  },
  '/api/ovie/certifications': {
    rows: [
      {
        domain: 'flows',
        state: 'working',
        tiers: { runtime_dogfood: 'passed' },
      },
    ],
  },
};

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
  let inbox: OvieInbox;

  beforeEach(() => {
    readyTiming.mockReset();
    panelAlert.mockReset();
    shipping.data = snapshot();
    inbox = INBOX;
    toastMock.mockClear();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/ovie/inbox')
        return new Response(JSON.stringify(inbox), { status: 200 });
      if (url in COMPANY_RESPONSES)
        return new Response(JSON.stringify(COMPANY_RESPONSES[url]), {
          status: 200,
        });
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
      'Shipping off target: 1 item blocked'
    );
    const companyRow = await screen.findByTestId('home-loop-tile-runway');
    expect(companyRow).toHaveTextContent('6 days');
    expect(companyRow).toHaveTextContent('Default dead');
    expect(screen.getByTestId('home-loop-tile-golden-path')).toHaveTextContent(
      '1 of 1 pass in prod'
    );
    expect(screen.getByTestId('home-loop-done')).toHaveTextContent('3 merges');
    // Stage time lives on Shipping; Home shows only metrics with a target.
    expect(screen.queryByTestId('home-loop-stage-strip')).toBeNull();
    expect(screen.getByTestId('home-loop-kanban-card')).toHaveAttribute(
      'data-attention',
      'blocked'
    );
  });

  it('links overflowing in-flight tasks to the shipping surface', () => {
    const base = snapshot();
    shipping.data = {
      ...base,
      operationalTasks: {
        ...base.operationalTasks,
        tasks: Array.from({ length: 4 }, (_, index) => ({
          ...base.operationalTasks.tasks[0],
          id: `linear:JOV-${index + 1}`,
          linearIdentifier: `JOV-${index + 1}`,
        })),
      },
    };
    const restore = mockFitLayout('home-loop-kanban-cards', 150);
    try {
      renderCanvas();
      const more = screen.getByRole('link', { name: '+3 more' });
      expect(more).toHaveAttribute('href', APP_ROUTES.ADMIN_SHIPPING);
    } finally {
      restore();
    }
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

  it.each(['disconnected', 'unauthorized'])(
    'settles a cold %s shipping failure as an error',
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
      expect(screen.getByTestId('home-loop-in-flight-section')).toHaveAttribute(
        'data-state',
        'error'
      );
      expect(
        within(screen.getByTestId('home-loop-in-flight-section')).getByText(
          'Shipping data could not load.'
        )
      ).toBeVisible();
      await screen.findByTestId('home-loop-ask-approve');
      expect(readyTiming).toHaveBeenLastCalledWith(true);
      expect(panelAlert).toHaveBeenCalledWith(
        'shipping-loop',
        connection === 'unauthorized'
          ? 'unauthorized'
          : 'operational-tasks-unavailable'
      );
    }
  );

  it('raises no panel alert when every section is ready', async () => {
    shipping.data = snapshot();
    renderCanvas();
    await screen.findByTestId('home-loop-ask-approve');
    expect(panelAlert).not.toHaveBeenCalled();
  });

  it('keeps reconciled tasks visible when a later shipping read fails', () => {
    const base = snapshot();
    shipping.data = {
      ...base,
      view: { ...base.view, connection: 'disconnected' },
      operationalRequestState: 'error',
    };
    renderCanvas();
    expect(screen.getByTestId('home-loop-in-flight-section')).toHaveAttribute(
      'data-state',
      'populated'
    );
    expect(screen.getByText('Blocked task')).toBeVisible();
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

  it('names Linear and certification actions instead of Approve', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/ovie/inbox') {
        return new Response(
          JSON.stringify({
            issues: [],
            cases: [
              {
                ...INBOX.cases[0],
                id: 'linear:JOV-9',
                title: 'Close the launch issue',
                decisionTarget: { kind: 'linear', id: 'JOV-9' },
              },
              {
                ...INBOX.cases[0],
                id: 'certification:row-1',
                title: 'Certify the homepage',
                decisionTarget: {
                  kind: 'certification',
                  id: 'row-1',
                  evidenceDigest: 'digest',
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response('not found', { status: 404 });
    });
    renderCanvas();
    expect(
      await screen.findByRole('button', { name: 'Mark done' })
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Certify' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Approve' })
    ).not.toBeInTheDocument();

    vi.useFakeTimers();
    const linearCard = screen
      .getByRole('heading', { name: 'Close the launch issue' })
      .closest('[data-testid="home-loop-ask"]') as HTMLElement;
    fireEvent.click(
      within(linearCard).getByRole('button', { name: 'Mark done' })
    );
    expect(within(linearCard).getByRole('status')).toHaveTextContent(
      'Marked done'
    );
  });

  describe('Linear answers', () => {
    beforeEach(() => {
      inbox = {
        issues: [],
        cases: [
          {
            ...INBOX.cases[0],
            id: 'linear:JOV-9',
            title: 'Sign in to the build runner',
            answers: ['Signed in', 'Restarted it myself'],
            decisionTarget: { kind: 'linear', id: 'JOV-9' },
          },
        ],
      };
    });

    it.each(['Signed in', 'Restarted it myself', 'written reply'])(
      'sends %s as the answer only after the undo window closes',
      async answer => {
        renderCanvas();
        await screen.findByRole('button', { name: 'Signed in' });
        expect(
          screen.queryByRole('button', { name: 'Mark done' })
        ).not.toBeInTheDocument();
        vi.useFakeTimers();
        if (answer === 'written reply') {
          fireEvent.change(
            screen.getByRole('textbox', {
              name: 'Reply: Sign in to the build runner',
            }),
            { target: { value: answer } }
          );
          fireEvent.click(screen.getByRole('button', { name: 'Send Reply' }));
        } else {
          fireEvent.click(screen.getByRole('button', { name: answer }));
        }
        expect(
          within(screen.getByTestId('home-loop-ask')).getByRole('status')
        ).toHaveTextContent(
          `${answer === 'written reply' ? 'Replied' : 'Answered'}: ${answer}`
        );
        await act(async () => {
          await vi.advanceTimersByTimeAsync(HOME_LOOP_UNDO_WINDOW_MS - 1);
        });
        expect(fetchMock).not.toHaveBeenCalledWith(
          '/api/admin/hud/tim-actions',
          expect.anything()
        );
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1);
        });
        const posts = fetchMock.mock.calls.filter(
          ([url]) => url === '/api/admin/hud/tim-actions'
        );
        expect(posts).toHaveLength(1);
        expect(posts[0][1]).toEqual({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ issueId: 'JOV-9', answer }),
        });
      }
    );

    it('cancels the Linear answer when undone', async () => {
      renderCanvas();
      const option = await screen.findByRole('button', { name: 'Signed in' });
      vi.useFakeTimers();
      fireEvent.click(option);
      const action = toastMock.mock.calls.at(-1)?.[1]?.action;
      expect(action).toEqual({ label: 'Undo', onClick: expect.any(Function) });
      act(() => {
        if (action && typeof action !== 'function') action.onClick();
      });
      expect(screen.getByRole('button', { name: 'Signed in' })).toBeVisible();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(HOME_LOOP_UNDO_WINDOW_MS);
      });
      expect(fetchMock).not.toHaveBeenCalledWith(
        '/api/admin/hud/tim-actions',
        expect.anything()
      );
    });

    it('restores the answer controls when Linear cannot record the answer', async () => {
      renderCanvas();
      const option = await screen.findByRole('button', { name: 'Signed in' });
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 502 }));
      vi.useFakeTimers();
      fireEvent.click(option);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(HOME_LOOP_UNDO_WINDOW_MS);
      });
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Not recorded. Try again.'
      );
      expect(screen.getByRole('button', { name: 'Signed in' })).toBeVisible();
      expect(
        within(screen.getByTestId('home-loop-ask')).queryByRole('status')
      ).not.toBeInTheDocument();
    });
  });

  it('keeps loaded asks and names the missing source when the inbox is partial', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/ovie/inbox') {
        return new Response(
          JSON.stringify({
            ...INBOX,
            issues: ['Requested work could not be loaded.'],
          }),
          { status: 200 }
        );
      }
      return new Response('not found', { status: 404 });
    });
    renderCanvas();
    expect(
      await screen.findByText('Vercel on-demand concurrency')
    ).toBeVisible();
    expect(
      screen.getByTestId('home-loop-asks-section-notice')
    ).toHaveTextContent(
      'Source needs attention. Requested work could not be loaded.'
    );
    expect(screen.getByTestId('home-loop-asks-section')).toHaveAttribute(
      'data-state',
      'populated'
    );
  });

  it('does not call a partial inbox empty when no asks loaded', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/ovie/inbox') {
        return new Response(
          JSON.stringify({
            cases: [],
            issues: ['Requested work could not be loaded.'],
          }),
          { status: 200 }
        );
      }
      return new Response('not found', { status: 404 });
    });
    renderCanvas();
    expect(
      await screen.findByTestId('home-loop-asks-section-notice')
    ).toHaveTextContent(
      'Source needs attention. Requested work could not be loaded.'
    );
    expect(
      screen.queryByText('Nothing needs your decision.')
    ).not.toBeInTheDocument();
  });

  it('collapses many source issues to a count with a link to the inbox', async () => {
    const issues = Array.from(
      { length: 27 },
      (_, index) =>
        `Marketing component ${index}: additional evidence is required.`
    );
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/ovie/inbox'
        ? new Response(JSON.stringify({ ...INBOX, issues }), { status: 200 })
        : new Response('not found', { status: 404 })
    );
    renderCanvas();
    const notice = await screen.findByTestId('home-loop-asks-section-notice');
    expect(notice).toHaveTextContent('27 source issues need attention.');
    expect(notice).not.toHaveTextContent('Marketing component');
    expect(
      screen.getByTestId('home-loop-asks-section-notice-link')
    ).toHaveAttribute('href', '/app/ov/inbox');
  });

  it('shows at most three asks; the rest resolve by their defaults', async () => {
    const base = INBOX.cases[0];
    if (!base) throw new Error('fixture');
    inbox = {
      issues: [],
      cases: Array.from({ length: 5 }, (_, index) => ({
        ...base,
        id: `summer:card-${index}`,
        title: `Ask ${index}`,
        decisionTarget: { kind: 'summer' as const, id: `card-${index}` },
      })),
    };
    renderCanvas();
    await screen.findByText('Ask 0');
    expect(screen.queryByText('Ask 3')).toBeNull();
    expect(
      screen.getByTestId('home-loop-asks-section-notice')
    ).toHaveTextContent('2 more resolve by their defaults');
  });

  it('opens on the company loop, not an earlier conversation', async () => {
    renderCanvas(chatState());
    await screen.findByText('Vercel on-demand concurrency');
    expect(screen.queryByTestId('home-loop-answer')).toBeNull();
    expect(screen.getByTestId('home-loop-kanban-card')).toBeVisible();
  });

  it('renders the latest turn in place and restores earlier canvas states', async () => {
    const chat = chatState();
    renderThenAsk(chat);
    await screen.findByText('Vercel on-demand concurrency');

    const answer = screen.getByTestId('home-loop-answer');
    expect(answer).toHaveTextContent('Shipping?');
    expect(answer).toHaveTextContent('2 of 2');
    // Shipping cards update the in-flight section in place.
    expect(
      screen.getByTestId('home-loop-in-flight-generated')
    ).toHaveTextContent('Shipping Now');
    expect(screen.queryByTestId('home-loop-kanban-card')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Previous Answer' }));
    expect(screen.getByTestId('home-loop-answer')).toHaveTextContent(
      'MRR is up.'
    );
    expect(screen.getByTestId('home-loop-answer')).toHaveTextContent(
      'Monthly Revenue'
    );
    expect(screen.getByTestId('home-loop-kanban-card')).toBeVisible();

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
    await screen.findByText('Vercel on-demand concurrency');
    expect(screen.getByTestId('home-loop-answer')).toHaveAttribute(
      'data-state',
      'pending'
    );
    expect(screen.getByTestId('home-loop-answer-pending')).toBeVisible();
  });
});
