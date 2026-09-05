import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OvieShippingStateCard } from '@/components/features/admin/hud/OvieShippingStateCard';
import { SHIPPING_STATE_SCHEMA } from '@/lib/ovie/shipping-state-client';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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
const projection = {
  schema: SHIPPING_STATE_SCHEMA,
  projectionId: 'proj-1',
  eventId: 'proj-1',
  sequence: 4,
  producerId: 'ubuntu-operational-truth',
  producerVersion: '1',
  sourceId: 'fleet-receipt',
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
    'symphony-runtime': {
      counts: { running: { state: 'measured-zero', value: 0 } },
    },
    'github-native-merge-queue': {
      counts: { queued: { state: 'measured-nonzero', value: 2 } },
    },
  },
  meanings: {
    merged: { state: 'measured', value: false },
    queued: { state: 'measured', value: true },
    ciGreen: { state: 'measured', value: true },
    productionVerified: { state: 'measured', value: true },
    exactLiveBuild: { state: 'measured', value: true },
  },
};

const LABELS = [
  'Queued',
  'In Flight',
  'Merged',
  'CI Green',
  'Production Verified',
  'Exact Live Build',
] as const;

describe('OvieShippingStateCard', () => {
  afterEach(() => {
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
    expect(panel().className).toContain('min-h-40');
    for (const label of LABELS) {
      expect(screen.getByText(label)).toBeTruthy();
    }

    await waitFor(() => {
      expect(panel()).toHaveAttribute('data-truth', 'fresh');
    });
    expect(panel()).toHaveAttribute('data-entity', 'ovie.shipping-state');
    expect(panel()).toHaveAttribute('data-revision', 'rev-4');
    expect(panel()).toHaveAttribute('data-correlation', 'corr-4');
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getByText('No')).toBeTruthy();
    for (const label of LABELS) {
      expect(screen.getByText(label)).toBeTruthy();
    }
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
    expect(screen.getAllByText('\u2014').length).toBeGreaterThan(0);
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
          sources: {
            'symphony-runtime': {
              counts: { running: { state: 'measured-zero', value: 0 } },
            },
            'github-native-merge-queue': {
              counts: { queued: { state: 'measured-nonzero', value: 7 } },
            },
          },
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
    expect(screen.getByText('7')).toBeTruthy();
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
});
