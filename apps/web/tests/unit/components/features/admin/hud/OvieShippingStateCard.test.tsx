import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperationalTasksPanel } from '@/components/features/admin/hud/OperationalTasksPanel';
import { OvieShippingStateCard } from '@/components/features/admin/hud/OvieShippingStateCard';
import {
  hudShippingStateRetentionForTests,
  resetHudShippingStateForTests,
} from '@/components/features/admin/hud/useHudShippingStateQuery';
import { unknownProjection } from '@/lib/ovie/shipping-state';
import { SHIPPING_STATE_SCHEMA } from '@/lib/ovie/shipping-state-client';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function RetentionHarness({
  client,
  showCard,
}: {
  client: QueryClient;
  showCard: boolean;
}) {
  return (
    <QueryClientProvider client={client}>
      <div>
        {showCard ? <OvieShippingStateCard kioskToken='token-a' /> : null}
      </div>
      <OperationalTasksPanel kioskToken='token-a' />
    </QueryClientProvider>
  );
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(settle => {
    resolve = settle;
  });
  return { promise, resolve };
}

const NOW = Date.now();
const LIVE_SHA = 'ee7401f37e0b324e225751f0d97ce229838ac8b4';
const CERT_SHA = 'c3e74e00a9d234b8f6a1b2c3d4e5f60718293a4b';
const STAGE_SHA = 'a1b2c3d4e5f60718293a4bc3e74e00a9d234b8f6';
const count = (value: number) =>
  value === 0
    ? { state: 'measured-zero', value: 0 }
    : { state: 'measured-nonzero', value };
/** Fixture shaped from the live truth sources on 2026-09-27. */
const delivery = {
  lanes: {
    running: count(7),
    slots: count(9),
    idle: count(2),
    pool: count(186),
    lastLandingAgeSeconds: count(85),
    diskFreePct: 28.4,
    lanes: [
      { name: 'devin', running: 4, slots: 4 },
      { name: 'codex', running: 3, slots: 3 },
      { name: 'hyperagent', running: 0, slots: 2 },
    ],
    alerts: ['61 harness-failed runs in 24h'],
    heldByReason: { 'gate-check-failed': 10 },
    failedByReason: { legacy: 28 },
    publishedAt: new Date(NOW - 60_000).toISOString(),
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
    sha: CERT_SHA,
    certifiedAt: new Date(NOW - 1_800_000).toISOString(),
  },
  production: {
    sha: LIVE_SHA,
    version: '26.9.15',
    deployedAt: new Date(NOW - 3_600_000).toISOString(),
    behindMain: count(54),
  },
  staging: {
    sha: STAGE_SHA,
    version: '26.9.16',
    deployedAt: new Date(NOW - 1_200_000).toISOString(),
    behindMain: count(2),
  },
  summer: { availability: 'up' },
};
const projection = {
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
  observationTimestamp: new Date(NOW).toISOString(),
  emissionTimestamp: new Date(NOW).toISOString(),
  freshnessDeadline: new Date(NOW + 8_000).toISOString(),
  correlation: { workId: 'corr-4' },
  lastError: null,
  state: 'fresh',
  publishing: true,
  sources: {
    'lane-pull-requests': {
      counts: { running: { state: 'measured-zero', value: 0 } },
    },
    'github-native-merge-queue': {
      counts: { queued: { state: 'measured-nonzero', value: 2 } },
    },
  },
  delivery,
  meanings: {
    merged: { state: 'measured', value: false },
    queued: { state: 'measured', value: true },
    ciGreen: { state: 'measured', value: true },
    productionVerified: { state: 'measured', value: true },
    exactLiveBuild: { state: 'measured', value: true },
  },
};

function cockpitWithTask(title: string) {
  const base = unknownProjection({
    sequence: 1,
    observationTimestamp: '2026-09-01T22:00:00.000Z',
    emissionTimestamp: '2026-09-01T22:00:00.000Z',
    latencyMs: 1,
    publishing: true,
    lastError: null,
  });
  return {
    ...base,
    operationalTasks: {
      ...base.operationalTasks,
      syncState: 'fresh' as const,
      lastSyncedAt: '2026-09-01T22:00:00.000Z',
      tasks: [
        {
          id: 'linear:JOV-5544',
          linearIdentifier: 'JOV-5544',
          linearUrl: 'https://linear.app/jovie/issue/JOV-5544/cache',
          title,
          workflowState: 'running' as const,
          priority: 'high' as const,
          attempt: 1,
          retryAt: null,
          sourceRevision: 'rev-token-a',
          updatedAt: '2026-09-01T22:00:00.000Z',
        },
      ],
    },
  };
}

const LABELS = [
  'Lanes Running',
  'Merge Queue',
  'Merged Today',
  'In Flight',
  'Jovie / LYB / Summer',
  'Merged 7d',
  'Certified HEAD',
  'Staging',
  'Production',
  'Behind Main',
  'CI Green',
  'Summer',
] as const;

function metricValue(label: string): string | null {
  const row = screen.getByText(label).closest('div')?.parentElement;
  return row?.lastElementChild?.textContent ?? null;
}

describe('OvieShippingStateCard', () => {
  afterEach(() => {
    resetHudShippingStateForTests();
    fetchMock.mockReset();
  });

  it('keeps Delivery geometry and labels across unknown and fresh, including measured zero', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, projection));
    render(
      <QueryClientProvider client={createQueryClient()}>
        <OvieShippingStateCard />
      </QueryClientProvider>
    );
    const panel = () => screen.getByTestId('hud-shipper-status-panel');

    expect(panel()).toHaveAttribute('data-truth', 'unknown');
    expect(panel()).toHaveAttribute('aria-label', 'Ubuntu Shipping State');
    expect(
      screen.getByTestId('hud-shipper-status-geometry').className
    ).toContain('min-h-40');
    for (const label of LABELS) {
      expect(screen.getByText(label)).toBeTruthy();
    }

    await waitFor(() => {
      expect(panel()).toHaveAttribute('data-truth', 'fresh');
    });
    expect(panel()).toHaveAttribute('data-entity', 'ovie.shipping-state');
    expect(panel()).toHaveAttribute('data-revision', 'rev-4');
    expect(panel()).toHaveAttribute('data-correlation', 'corr-4');
    expect(metricValue('Lanes Running')).toBe('7/9');
    expect(metricValue('Merge Queue')).toBe('2');
    expect(metricValue('Merged Today')).toBe('292');
    expect(metricValue('In Flight')).toBe('0');
    expect(metricValue('Jovie / LYB / Summer')).toBe('189 / 17 / 26');
    expect(metricValue('Merged 7d')).toBe('862 (+283% WoW)');
    expect(metricValue('Certified HEAD')).toBe('c3e74e0');
    expect(metricValue('Staging')).toBe('26.9.16 a1b2c3d');
    expect(metricValue('Production')).toBe('26.9.15 ee7401f');
    expect(metricValue('Behind Main')).toBe('54');
    expect(metricValue('CI Green')).toBe('Yes');
    expect(metricValue('Summer')).toBe('Up');
    expect(
      screen.getByText(
        'devin 4/4 · codex 3/3 · hyperagent 0/2 · pool 186 · last landing 1m ago'
      )
    ).toBeTruthy();
    expect(screen.getByText('61 harness-failed runs in 24h')).toBeTruthy();
    expect(screen.getByText('Capacity source gap')).toBeTruthy();
    for (const label of LABELS) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('fails soft per metric: a missing source reads n/a without blanking the card', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        ...projection,
        state: 'partial',
        lastError: {
          at: new Date(NOW).toISOString(),
          code: 'unavailable',
          message: 'GitHub GraphQL returned 502',
        },
        delivery: {
          ...delivery,
          merges: {
            since: null,
            today: { state: 'not-measured', value: null },
            byRepo: {
              Jovie: { state: 'not-measured', value: null },
              LogYourBody: { state: 'not-measured', value: null },
              'summer-config': { state: 'not-measured', value: null },
            },
            last7Days: { state: 'not-measured', value: null },
            prior7Days: { state: 'not-measured', value: null },
          },
          summer: 'malformed',
          lanes: { ...delivery.lanes, stale: true },
        },
      })
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <OvieShippingStateCard />
      </QueryClientProvider>
    );
    const panel = () => screen.getByTestId('hud-shipper-status-panel');

    await waitFor(() => {
      expect(panel()).toHaveAttribute('data-truth', 'degraded');
    });
    expect(metricValue('Merged Today')).toBe('n/a');
    expect(metricValue('Jovie / LYB / Summer')).toBe('n/a / n/a / n/a');
    expect(metricValue('Merged 7d')).toBe('n/a');
    expect(metricValue('Summer')).toBe('n/a');
    expect(metricValue('Lanes Running')).toBe('7/9 stale');
    expect(metricValue('Merge Queue')).toBe('2');
    expect(metricValue('Behind Main')).toBe('54');
    expect(screen.getByText('GitHub GraphQL returned 502')).toBeTruthy();
  });

  it('does not render zero for unauthorized before any successful measurement', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: 'Unauthorized', state: 'unauthorized' })
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <OvieShippingStateCard />
      </QueryClientProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('hud-shipper-status-panel')).toHaveAttribute(
        'data-truth',
        'unauthorized'
      );
    });
    expect(screen.queryByText('0')).toBeNull();
    expect(metricValue('Merged Today')).toBe('n/a');
    expect(metricValue('Lanes Running')).toBe('n/a');
  });

  it('does not refetch for the initial pageshow event', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, projection));
    render(
      <QueryClientProvider client={createQueryClient()}>
        <OvieShippingStateCard />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('hud-shipper-status-panel')).toHaveAttribute(
        'data-truth',
        'fresh'
      );
    });
    const callsAfterMount = fetchMock.mock.calls.length;
    const initialPageShow = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(initialPageShow, 'persisted', { value: false });

    window.dispatchEvent(initialPageShow);
    await new Promise(resolve => setTimeout(resolve, 25));

    expect(fetchMock).toHaveBeenCalledTimes(callsAfterMount);
  });

  it('resets the shipping state machine when the kiosk token changes', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, projection))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ...projection,
          projectionId: 'proj-token-b',
          eventId: 'proj-token-b',
          sequence: 1,
          sourceRevision: 'rev-token-b',
          correlation: { workId: 'corr-token-b' },
          delivery: { ...delivery, mergeQueueDepth: count(7) },
        })
      );
    const client = createQueryClient();
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <OvieShippingStateCard kioskToken='token-a' />
      </QueryClientProvider>
    );
    const panel = () => screen.getByTestId('hud-shipper-status-panel');

    await waitFor(() => {
      expect(panel()).toHaveAttribute('data-revision', 'rev-4');
    });

    rerender(
      <QueryClientProvider client={client}>
        <OvieShippingStateCard kioskToken='token-b' />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(panel()).toHaveAttribute('data-revision', 'rev-token-b');
    });
    expect(panel()).toHaveAttribute('data-correlation', 'corr-token-b');
    expect(metricValue('Merge Queue')).toBe('7');
  });

  it('ignores an aborted old-token response before applying a new token projection', async () => {
    const oldToken = deferredResponse();
    const newToken = deferredResponse();
    fetchMock
      .mockImplementationOnce(() => oldToken.promise)
      .mockImplementationOnce(() => newToken.promise);
    const client = createQueryClient();
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <OvieShippingStateCard kioskToken='token-a' />
      </QueryClientProvider>
    );
    const panel = () => screen.getByTestId('hud-shipper-status-panel');

    rerender(
      <QueryClientProvider client={client}>
        <OvieShippingStateCard kioskToken='token-b' />
      </QueryClientProvider>
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    oldToken.resolve(jsonResponse(200, projection));
    await Promise.resolve();
    newToken.resolve(
      jsonResponse(200, {
        ...projection,
        projectionId: 'proj-token-b-race',
        eventId: 'proj-token-b-race',
        sequence: 1,
        sourceRevision: 'rev-token-b-race',
        correlation: { workId: 'corr-token-b-race' },
      })
    );

    await waitFor(() => {
      expect(panel()).toHaveAttribute('data-revision', 'rev-token-b-race');
    });
    expect(panel()).toHaveAttribute('data-correlation', 'corr-token-b-race');
  });

  it('shares one shipping-state poll with the operational task panel', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, projection));
    render(
      <QueryClientProvider client={createQueryClient()}>
        <OvieShippingStateCard kioskToken='shared' />
        <OperationalTasksPanel kioskToken='shared' />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('hud-shipper-status-panel')).toHaveAttribute(
        'data-revision',
        'rev-4'
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/api/hud/shipping-state'
    );
  });

  it('does not keep the previous token operational tasks after a switch or a 401', async () => {
    const tokenB = deferredResponse();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, cockpitWithTask('Token A secret'))
      )
      .mockImplementationOnce(() => tokenB.promise);
    const client = createQueryClient();
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <OperationalTasksPanel kioskToken='token-a' />
        <OvieShippingStateCard kioskToken='token-a' />
      </QueryClientProvider>
    );

    expect(await screen.findByText('Token A secret')).toBeTruthy();

    rerender(
      <QueryClientProvider client={client}>
        <OperationalTasksPanel kioskToken='token-b' />
        <OvieShippingStateCard kioskToken='token-b' />
      </QueryClientProvider>
    );

    expect(screen.queryByText('Token A secret')).toBeNull();
    expect(screen.getByTestId('hud-shipper-status-panel')).toHaveAttribute(
      'data-revision',
      ''
    );

    tokenB.resolve(jsonResponse(401, { error: 'Unauthorized' }));
    await waitFor(() => {
      expect(screen.getByTestId('hud-shipper-status-panel')).toHaveAttribute(
        'data-truth',
        'unauthorized'
      );
    });
    expect(screen.queryByText('Token A secret')).toBeNull();
  });

  it('drops a token operational feed after that token returns 401', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, cockpitWithTask('Token A secret'))
      )
      .mockResolvedValueOnce(
        jsonResponse(401, { error: 'Unauthorized', state: 'unauthorized' })
      );
    const client = createQueryClient();
    render(
      <QueryClientProvider client={client}>
        <OperationalTasksPanel kioskToken='token-a' />
      </QueryClientProvider>
    );

    expect(await screen.findByText('Token A secret')).toBeTruthy();
    await client.refetchQueries({
      queryKey: ['hud', 'shipping-state', 'token-a'],
    });

    await waitFor(() => {
      expect(screen.queryByText('Token A secret')).toBeNull();
    });
    expect(
      screen.getByText('Task cache unavailable. Retrying automatically.')
    ).toBeTruthy();
  });

  it('drops module shipping maps when the last observer unmounts or the query is removed', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, cockpitWithTask('Token A secret'))
    );
    const client = createQueryClient();
    const { rerender, unmount } = render(
      <RetentionHarness client={client} showCard />
    );

    expect(await screen.findByText('Token A secret')).toBeTruthy();
    expect(hudShippingStateRetentionForTests()).toEqual({
      machines: 1,
      operationalFeeds: 1,
    });

    rerender(<RetentionHarness client={client} showCard={false} />);
    expect(hudShippingStateRetentionForTests()).toEqual({
      machines: 1,
      operationalFeeds: 1,
    });

    client.removeQueries({ queryKey: ['hud', 'shipping-state', 'token-a'] });
    expect(hudShippingStateRetentionForTests()).toEqual({
      machines: 0,
      operationalFeeds: 0,
    });

    expect(await screen.findByText('Token A secret')).toBeTruthy();
    unmount();
    expect(hudShippingStateRetentionForTests()).toEqual({
      machines: 0,
      operationalFeeds: 0,
    });
  });
});
