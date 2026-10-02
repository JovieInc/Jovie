import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperationalTasksPanel } from '@/components/features/admin/hud/OperationalTasksPanel';
import { OvieShippingStateCard } from '@/components/features/admin/hud/OvieShippingStateCard';
import {
  hudShippingStateRetentionForTests,
  resetHudShippingStateForTests,
} from '@/components/features/admin/hud/useHudShippingStateQuery';
import { unknownProjection } from '@/lib/ovie/shipping-state';
import {
  SHIPPING_STATE_REQUEST_TIMEOUT_MS,
  SHIPPING_STATE_SCHEMA,
} from '@/lib/ovie/shipping-state-client';

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
/** One capacity-horizon lease row, shaped per lib/ovie/shipping-state/capacity.ts. */
const capacityLease = {
  leaseId: 'codex:lane-a',
  alias: 'lane-a',
  provider: 'codex',
  sourcePresent: true,
  available: true,
  subscriptionStatus: 'active' as const,
  compatibility: { cli: '2.1', harness: '1.0', models: [], restrictions: [] },
  concurrency: 2,
  usableRemaining: 40,
  bankedCount: 0,
  event: {
    kind: 'natural-reset' as const,
    label: 'reset',
    at: null,
    countdownSeconds: 3_600,
  },
  forecast: {
    schema: 'jovie.drain-forecast/v1' as const,
    completionP50At: null,
    completionP90At: null,
    sustainablePercentPerHour: 5,
    burstPercentPerHour: 8,
    usableBeforeUnavailability: 10,
    projectedUnused: 2,
    qualifiedWork: [],
    bottleneck: null,
  },
  route: {
    schema: 'jovie.capacity-route-receipt/v1' as const,
    selectedJob: 'JOV-1234',
    selectedRoute: 'lane-a',
    selectedLeaseId: 'codex:lane-a',
    alternativesConsidered: ['lane-b'],
    marginalValue: 1,
    expectedCertifiedOutcome: 'ship',
    drainMode: 'normal' as const,
    modeTrigger: 'least-recently-used',
    reason: 'least-recently-used available compatible lease',
    replanConditions: ['lane-a exhausted'],
    sourceGaps: [],
  },
  mode: 'normal' as const,
  outcomes: {
    useful: 1,
    certified: 1,
    duplicate: 0,
    retry: 0,
    failed: 0,
    unknown: 0,
  },
  freshness: { observedAt: null, status: 'fresh' as const, confidence: 'high' },
};
const deliveryWithCapacityLease = {
  ...delivery,
  lanes: {
    ...delivery.lanes,
    capacity: {
      schema: 'jovie.capacity-horizon/v1' as const,
      generatedAt: new Date(NOW).toISOString(),
      leases: [capacityLease],
      outcomes: capacityLease.outcomes,
      incidents: [],
      topBlocker: null,
      founderJudgmentRequired: false,
      controls: 'show-only' as const,
    },
  },
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
const projectionWithCapacityLease = {
  ...projection,
  delivery: deliveryWithCapacityLease,
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
    vi.useRealTimers();
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

  it('ages a connected projection to stale at its deadline without another read', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        ...projection,
        freshnessDeadline: new Date(NOW + 100).toISOString(),
      })
    );
    const client = createQueryClient();
    render(
      <QueryClientProvider client={client}>
        <OvieShippingStateCard />
      </QueryClientProvider>
    );
    const panel = () => screen.getByTestId('hud-shipper-status-panel');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(panel()).toHaveAttribute('data-truth', 'fresh');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_101);
      await vi.advanceTimersByTimeAsync(0);
    });
    await vi.waitFor(() =>
      expect(panel()).toHaveAttribute('data-truth', 'stale')
    );
    expect(panel()).toHaveAttribute('data-connection', 'connected');
    expect(panel()).toHaveAttribute('data-flags', 'cacheExpired');
    expect(screen.getByText('Cache expired')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('times out a hung read without inventing a measurement', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    fetchMock.mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        })
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <OvieShippingStateCard />
      </QueryClientProvider>
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SHIPPING_STATE_REQUEST_TIMEOUT_MS);
      await vi.advanceTimersByTimeAsync(0);
    });

    const panel = screen.getByTestId('hud-shipper-status-panel');
    await vi.waitFor(() =>
      expect(panel).toHaveAttribute('data-truth', 'unavailable')
    );
    expect(panel).toHaveAttribute('data-connection', 'disconnected');
    expect(screen.getByText('Shipping-state request timed out')).toBeTruthy();
    expect(metricValue('Merged Today')).toBe('n/a');
    expect(screen.queryByText('0')).toBeNull();
  });

  it('shows unsupported schema and sequence anomalies while retaining identity', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, projection))
      .mockResolvedValueOnce(jsonResponse(200, projection))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ...projection,
          projectionId: 'proj-replay',
          eventId: 'proj-replay',
          sequence: 3,
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ...projection,
          projectionId: 'proj-6',
          eventId: 'proj-6',
          sequence: 6,
          sourceRevision: 'rev-6',
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ...projection,
          projectionId: 'proj-6-conflict',
          eventId: 'proj-6-conflict',
          sequence: 6,
          sourceRevision: 'rev-conflict',
        })
      );
    const client = createQueryClient();
    render(
      <QueryClientProvider client={client}>
        <OvieShippingStateCard />
      </QueryClientProvider>
    );
    const panel = () => screen.getByTestId('hud-shipper-status-panel');
    await waitFor(() => expect(panel()).toHaveAttribute('data-truth', 'fresh'));

    await client.refetchQueries({ queryKey: ['hud', 'shipping-state', null] });
    await waitFor(() =>
      expect(panel()).toHaveAttribute('data-flags', 'duplicate')
    );
    expect(screen.getByText('Duplicate ignored')).toBeTruthy();

    await client.refetchQueries({ queryKey: ['hud', 'shipping-state', null] });
    await waitFor(() =>
      expect(panel()).toHaveAttribute('data-flags', 'replay')
    );
    expect(screen.getByText('Replay ignored')).toBeTruthy();
    expect(panel()).toHaveAttribute('data-revision', 'rev-4');

    await client.refetchQueries({ queryKey: ['hud', 'shipping-state', null] });
    await waitFor(() =>
      expect(panel()).toHaveAttribute('data-flags', 'sequenceGap')
    );
    expect(screen.getByText('Sequence gap')).toBeTruthy();
    expect(panel()).toHaveAttribute('data-revision', 'rev-6');

    await client.refetchQueries({ queryKey: ['hud', 'shipping-state', null] });
    await waitFor(() => {
      expect(panel()).toHaveAttribute('data-truth', 'degraded');
      expect(panel()).toHaveAttribute('data-flags', 'contradictory');
    });
    expect(screen.getByText('Contradictory sequence ignored')).toBeTruthy();
    expect(panel()).toHaveAttribute('data-revision', 'rev-6');
  });

  it('renders an unsupported successful response as unknown, not unavailable', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { ...projection, schema: 'ovie.shipping-state.v2' })
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <OvieShippingStateCard />
      </QueryClientProvider>
    );

    expect(
      await screen.findByText('Unsupported shipping-state schema')
    ).toBeTruthy();
    const panel = screen.getByTestId('hud-shipper-status-panel');
    expect(panel).toHaveAttribute('data-truth', 'unknown');
    expect(panel).toHaveAttribute('data-flags', 'unsupportedSchema');
    expect(screen.getByText('Unsupported schema')).toBeTruthy();
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

  it('refetches on a persisted pageshow and recovers from unavailability', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, projection))
      .mockResolvedValueOnce(jsonResponse(503, { error: 'Source offline' }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ...projection,
          projectionId: 'proj-5',
          eventId: 'proj-5',
          sequence: 5,
          sourceRevision: 'rev-5',
        })
      );
    const client = createQueryClient();
    render(
      <QueryClientProvider client={client}>
        <OvieShippingStateCard />
      </QueryClientProvider>
    );
    const panel = () => screen.getByTestId('hud-shipper-status-panel');
    await waitFor(() => expect(panel()).toHaveAttribute('data-truth', 'fresh'));
    await client.refetchQueries({ queryKey: ['hud', 'shipping-state', null] });
    await waitFor(() =>
      expect(panel()).toHaveAttribute('data-truth', 'unavailable')
    );

    const resumedPage = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(resumedPage, 'persisted', { value: true });
    window.dispatchEvent(resumedPage);

    await waitFor(() =>
      expect(panel()).toHaveAttribute('data-truth', 'recovery')
    );
    expect(panel()).toHaveAttribute('data-revision', 'rev-5');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('accepts a restarted producer sequence after a cold relaunch', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, projection))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ...projection,
          projectionId: 'proj-cold-1',
          eventId: 'proj-cold-1',
          sequence: 1,
          sourceRevision: 'rev-cold-1',
          correlation: { workId: 'corr-cold-1' },
        })
      );
    const firstSession = render(
      <QueryClientProvider client={createQueryClient()}>
        <OvieShippingStateCard kioskToken='packaged-session' />
      </QueryClientProvider>
    );
    const panel = () => screen.getByTestId('hud-shipper-status-panel');
    await waitFor(() =>
      expect(panel()).toHaveAttribute('data-revision', 'rev-4')
    );
    firstSession.unmount();

    render(
      <QueryClientProvider client={createQueryClient()}>
        <OvieShippingStateCard kioskToken='packaged-session' />
      </QueryClientProvider>
    );
    await waitFor(() =>
      expect(panel()).toHaveAttribute('data-revision', 'rev-cold-1')
    );
    expect(panel()).toHaveAttribute('data-sequence', '1');
    expect(panel()).toHaveAttribute('data-flags', '');
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

  it('keeps the capacity-lease Linear link out of the reason disclosure toggle', async () => {
    // Regression for a WCAG 4.1.2 "nested-interactive" axe violation: an <a>
    // rendered inside a <summary> (itself a native toggle). The Linear link
    // and the reason disclosure must be siblings, not nested.
    fetchMock.mockResolvedValue(jsonResponse(200, projectionWithCapacityLease));
    const { container } = render(
      <QueryClientProvider client={createQueryClient()}>
        <OvieShippingStateCard />
      </QueryClientProvider>
    );

    const link = await screen.findByRole('link', { name: 'JOV-1234' });
    expect(link).toHaveAttribute(
      'href',
      'https://linear.app/jovie/issue/JOV-1234'
    );

    const summary = container.querySelector('summary');
    expect(summary).not.toBeNull();
    expect(summary?.querySelector('a')).toBeNull();
    expect(link.closest('summary')).toBeNull();

    // <details> is flow/block content a <p> cannot validly contain.
    expect(summary?.closest('details')?.closest('p')).toBeNull();

    // The decorative marker replacing the list-none disclosure triangle
    // stays out of the accessible name.
    const marker = summary?.querySelector('[aria-hidden="true"]');
    expect(marker).not.toBeNull();
    expect(marker?.getAttribute('aria-hidden')).toBe('true');
    expect(summary?.textContent).toContain(
      'least-recently-used available compatible lease'
    );
  });
});
