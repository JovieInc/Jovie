import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
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
    // Plain title only: the issue key stays out of the founder view.
    expect(
      screen.getByTestId('story-first-stage-investigating')
    ).not.toHaveTextContent('JOV-1');
    expect(
      screen.getByTestId('story-first-stage-investigating')
    ).toHaveTextContent('Blocked task');
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

  it('keeps the board crisp and interactive (no melt, no inert)', async () => {
    renderCanvas();
    const board = await screen.findByTestId('story-first-board');
    expect(board).not.toHaveAttribute('inert');
    expect(board).not.toHaveAttribute('aria-hidden');
    expect(board.className).not.toMatch(/blur|opacity|translate/);
  });

  it('shows no Moving work when no in-flight row works on the revenue blocker', async () => {
    companyResponses['/api/ovie/home/blocker'] = {
      generatedAt: '2026-11-08T23:00:00.000Z',
      blocker: {
        schema: 'jovie.company-blocker/v1',
        id: 'certification:checkout_payment_entitlement',
        kind: 'certification',
        step: 'checkout_payment_entitlement',
        tone: 'warn',
        text: "Checkout isn't fully measured yet, so we can't confirm anyone can pay",
        detailsHref: APP_ROUTES.ADMIN_CERTIFICATIONS,
        since: null,
        nextAction: null,
        observedAt: '2026-11-08T23:00:00.000Z',
      },
    };
    renderCanvas();
    const hero = await screen.findByTestId('story-first-bottleneck');
    await vi.waitFor(() =>
      expect(hero).toHaveTextContent("we can't confirm anyone can pay")
    );
    expect(hero).not.toHaveTextContent('Moving');
    expect(hero).not.toHaveTextContent('Blocked task');
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
