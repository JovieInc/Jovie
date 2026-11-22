import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHIPPING_STATE_SCHEMA } from '@/lib/ovie/shipping-state-client';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OvieShippingStateCard } from './OvieShippingStateCard';
import { resetHudShippingStateForTests } from './useHudShippingStateQuery';

const count = (value: number) =>
  value === 0
    ? { state: 'measured-zero', value: 0 }
    : { state: 'measured-nonzero', value };

function projection(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    schema: SHIPPING_STATE_SCHEMA,
    projectionId: 'proj-1',
    eventId: 'proj-1',
    sequence: 4,
    producerId: 'ubuntu-operational-truth',
    producerVersion: '1',
    sourceId: 'lanes-status',
    entityId: 'ovie.shipping-state',
    cursor: '4',
    sourceRevision: 'rev-4',
    observationTimestamp: new Date(now).toISOString(),
    emissionTimestamp: new Date(now).toISOString(),
    freshnessDeadline: new Date(now + 60_000).toISOString(),
    correlation: { workId: 'corr-4' },
    lastError: null,
    state: 'fresh',
    publishing: true,
    sources: {},
    delivery: {
      lanes: {
        running: count(7),
        slots: count(9),
        idle: count(2),
        pool: count(186),
        lastLandingAgeSeconds: count(85),
        diskFreePct: 28.4,
        lanes: [{ name: 'devin', running: 4, slots: 4 }],
        alerts: ['61 harness-failed runs in 24h'],
        heldByReason: {},
        failedByReason: {},
        publishedAt: new Date(now - 60_000).toISOString(),
        stale: false,
      },
      merges: {
        since: '2026-09-26T07:00:00Z',
        today: count(292),
        byRepo: {
          Jovie: count(189),
          LogYourBody: count(17),
          'summer-config': count(26),
        },
        last7Days: count(862),
        prior7Days: count(225),
      },
      mergeQueueDepth: count(2),
      inFlight: count(0),
      certifiedHead: {
        sha: 'c3e74e00a9d234b8f6a1b2c3d4e5f60718293a4b',
        certifiedAt: new Date(now - 1_800_000).toISOString(),
      },
      production: {
        sha: 'ee7401f37e0b324e225751f0d97ce229838ac8b4',
        version: '26.9.15',
        deployedAt: new Date(now - 3_600_000).toISOString(),
        behindMain: count(54),
      },
      staging: {
        sha: 'a1b2c3d4e5f60718293a4bc3e74e00a9d234b8f6',
        version: '26.9.16',
        deployedAt: new Date(now - 1_200_000).toISOString(),
        behindMain: count(2),
      },
      summer: { availability: 'up' },
    },
    meanings: {
      merged: { state: 'measured', value: false },
      queued: { state: 'measured', value: true },
      ciGreen: { state: 'measured', value: true },
      productionVerified: { state: 'measured', value: true },
      exactLiveBuild: { state: 'measured', value: true },
    },
    ...overrides,
  };
}

const fetchMock = vi.fn();

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OvieShippingStateCard />
    </QueryClientProvider>
  );
}

const panel = () => screen.getByTestId('hud-shipper-status-panel');

describe('OvieShippingStateCard (colocated)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    resetHudShippingStateForTests();
    vi.unstubAllGlobals();
  });

  it('is an axe-clean status region while the first poll is pending', async () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    const { container } = renderCard();

    expect(panel()).toHaveAttribute('role', 'status');
    expect(panel()).toHaveAttribute('aria-label', 'Ubuntu Shipping State');
    expect(panel()).toHaveAttribute('data-truth', 'unknown');
    expect(screen.getByTestId('hud-shipping-truth')).toHaveTextContent(
      'Syncing'
    );
    expect(
      screen.getByTestId('hud-delivery-metrics-syncing')
    ).toHaveTextContent('Some signals are still syncing.');
    await expectNoA11yViolations(container);
  });

  it('renders a fresh read with its alerts and source line, axe-clean', async () => {
    fetchMock.mockImplementation(async () => Response.json(projection()));
    const { container } = renderCard();

    await waitFor(() => expect(panel()).toHaveAttribute('data-truth', 'fresh'));
    expect(screen.getByText('Fresh')).toBeInTheDocument();
    expect(panel()).toHaveAttribute('data-revision', 'rev-4');
    expect(
      screen.queryByText('Lanes feed not measured')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('hud-delivery-metrics')).toHaveTextContent(
      '862 (+283% WoW)'
    );
    await expectNoA11yViolations(container);
  });

  it('shows Unauthorized without inventing zeros, axe-clean', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const { container } = renderCard();

    await waitFor(() =>
      expect(panel()).toHaveAttribute('data-truth', 'unauthorized')
    );
    expect(screen.getByText('Unauthorized')).toBeInTheDocument();
    const metrics = screen.queryByTestId('hud-delivery-metrics');
    expect(
      metrics?.querySelectorAll('[data-measured="unknown"]').length ?? 0
    ).toBe(0);
    expect(
      screen.getByTestId('hud-delivery-metrics-syncing')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('reads as disconnected when the poll cannot be sent, axe-clean', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { container } = renderCard();

    await waitFor(() =>
      expect(panel()).toHaveAttribute('data-connection', 'disconnected')
    );
    await expectNoA11yViolations(container);
  });

  it('marks a partial read degraded and shows the source error, axe-clean', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json(
        projection({
          state: 'partial',
          lastError: {
            at: new Date().toISOString(),
            code: 'unavailable',
            message: 'GitHub GraphQL returned 502',
          },
        })
      )
    );
    const { container } = renderCard();

    await waitFor(() =>
      expect(panel()).toHaveAttribute('data-truth', 'degraded')
    );
    expect(
      screen.getByTestId('hud-delivery-metrics-syncing')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('polls again when the window regains focus or the tab becomes visible', async () => {
    fetchMock.mockImplementation(async () => Response.json(projection()));
    renderCard();
    await waitFor(() => expect(panel()).toHaveAttribute('data-truth', 'fresh'));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const initialPageShow = new Event('pageshow');
    Object.defineProperty(initialPageShow, 'persisted', { value: false });
    fireEvent(window, initialPageShow);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
